import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { User } from "~~/shared/utils/types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin, openAPI, organization, twoFactor } from "better-auth/plugins";
import { v7 as uuidv7 } from "uuid";
import * as schema from "../database/schema";
import { asc, eq } from "drizzle-orm";
import type { SupportedLanguage } from "../emailTemplates";
import { logAudit } from "./audit";
import type { AuditAction } from "./audit/types";
import { getDB } from "./db";
import { isUserBannedFresh } from "./banStatus";
import { shouldBanGuardPath } from "./authBanGuard";
import { cacheClient } from "./drivers";
import { sendEmail } from "./email";
import { deriveOrgNameFromUser, generateUniqueOrgSlug } from "../services/org.service";
import { setupCreem } from "./creem";
import { runtimeConfig } from "./runtimeConfig";

if (import.meta.dev) {
    console.log(`Base URL is ${runtimeConfig.public.baseURL}`);
}

// sendInvitationEmail runs before afterCreateInvitation in the same request
// (better-auth awaits both sequentially); this map hands the delivery outcome
// across the two hooks. Entries are delete-on-read; the resend-invitation path
// has no afterCreate hook, so its entry is simply overwritten on the next resend.
const inviteDeliveryStatus = new Map<string, boolean>();

export async function logInviteAudit(
    input: { invitationId: string; email: string; inviterId: string; organizationId: string; role: string },
    delivered: boolean,
): Promise<void> {
    await logAudit(null, "team.member_invited", {
        userId: input.inviterId,
        organizationId: input.organizationId,
        targetType: "email",
        targetId: input.email,
        status: delivered ? "success" : "failure",
        details: { role: input.role, invitationId: input.invitationId, emailDelivered: delivered },
    });
}

export const createBetterAuth = () =>
    betterAuth({
        baseURL: runtimeConfig.public.baseURL,
        // In production only the baseURL is trusted. localhost and the Cloudflare
        // tunnel (ephemeral and reassignable → CSRF/open-redirect surface if
        // claimed) are ONLY included in dev, behind import.meta.dev (tree-shaken
        // to false in the production build).
        trustedOrigins: [
            runtimeConfig.public.baseURL,
            ...(import.meta.dev
                ? ["http://localhost:8787", "https://scholarships-adoption-cadillac-expanded.trycloudflare.com"]
                : []),
        ],
        secret: runtimeConfig.betterAuthSecret,
        database: drizzleAdapter(
            getDB(),
            {
                provider: "pg",
                schema,
            },
        ),
        advanced: {
            database: {
                generateId: () => {
                    return uuidv7();
                },
            },
        },
        user: {
            additionalFields: {
                locale: {
                    type: "string",
                    required: false,
                    defaultValue: "it",
                },
                tosAcceptedAt: {
                    type: "date",
                    required: false,
                    defaultValue: null,
                    input: false,
                },
            },
            changeEmail: {
                enabled: true,
                // Step 1: the confirmation is sent to the CURRENT address (account holder).
                // Only after the click does Better Auth send verification to the NEW address,
                // reusing emailVerification.sendVerificationEmail (see below).
                sendChangeEmailVerification: async ({ user, newEmail, url }) => {
                    const language = ((user as { locale?: string }).locale as SupportedLanguage) || 'it';
                    const result = await sendEmail({
                        type: "change_email",
                        to: user.email,
                        userId: user.id,
                        confirmUrl: url,
                        newEmail,
                        userName: user.name || undefined,
                        language,
                    });

                    if (!result.success) {
                        throw createError({
                            statusCode: 500,
                            statusMessage: "Internal Server Error",
                        });
                    }
                },
            },
        },
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        return {
                            data: {
                                ...user,
                                tosAcceptedAt: new Date(),
                            },
                        };
                    },
                    after: async (user) => {
                        // signup→org: creates the personal organization (owner) for the new user.
                        // Without headers/request: createOrganization uses body.userId (no session).
                        const name = deriveOrgNameFromUser({ name: user.name, email: user.email });
                        const slug = generateUniqueOrgSlug(name);
                        try {
                            const serverAuth = useServerAuth();
                            await serverAuth.api.createOrganization({
                                body: { name, slug, userId: user.id },
                            });
                        } catch (err) {
                            // Best-effort: do NOT rethrow. Better Auth commits the user INSERT BEFORE
                            // this hook and (on the email/password path) WITHOUT a transaction → a throw
                            // here would produce a 500 with the account already created (orphan user anyway).
                            // The "every user has an org" guarantee is provided by the self-heal in
                            // databaseHooks.session.create.before (creates the org on first login if missing).
                            console.error(`[signup→org] createOrganization failed for user ${user.id} (self-heal on first login):`, err);
                        }
                    },
                },
            },
            session: {
                create: {
                    before: async (session) => {
                        // Initial active org: the user's first membership (createdAt asc).
                        const db = getDB();
                        // TODO(F14): true concurrency (two logins racing) can still double-insert
                        // a personal org (slugs differ by uuidv7 suffix, so the UNIQUE(slug) does
                        // not catch it). A durable fix is a partial unique index guaranteeing one
                        // personal org per user, or a pg advisory lock keyed on userId. Deferred:
                        // needs a migration; the re-select in the self-heal branch below bounds
                        // the common case.
                        const findFirstOrg = async () =>
                            db
                                .select({ organizationId: schema.member.organizationId })
                                .from(schema.member)
                                .where(eq(schema.member.userId, session.userId))
                                .orderBy(asc(schema.member.createdAt))
                                .limit(1);

                        let rows = await findFirstOrg();

                        // Self-heal: if the user has no org (signup→org failed, or legacy user
                        // pre-1b), create a personal one NOW. This is the robust guarantee of "no orphan
                        // user", independent of the atomicity of the user.create.after hook.
                        if (!rows[0]) {
                            try {
                                const users = await db
                                    .select({ name: schema.user.name, email: schema.user.email })
                                    .from(schema.user)
                                    .where(eq(schema.user.id, session.userId))
                                    .limit(1);
                                const u = users[0];
                                if (u) {
                                    const name = deriveOrgNameFromUser({ name: u.name, email: u.email });
                                    const slug = generateUniqueOrgSlug(name);
                                    await useServerAuth().api.createOrganization({
                                        body: { name, slug, userId: session.userId },
                                    });
                                    // F14: re-select AFTER create. Under a concurrent login the
                                    // other request may have created the org first; re-reading here
                                    // means we adopt whichever committed first as the active org and
                                    // avoids acting on a stale empty read. (Does not fully prevent a
                                    // duplicate insert under true concurrency — that needs a DB unique
                                    // constraint on (member.userId, personal-org) or an advisory lock;
                                    // tracked as a deferred follow-up.)
                                    rows = await findFirstOrg();
                                }
                            } catch (err) {
                                console.error(`[session→org self-heal] createOrganization failed for user ${session.userId}:`, err);
                                rows = await findFirstOrg(); // a concurrent creator may have succeeded
                            }
                        }

                        const activeOrganizationId = rows[0]?.organizationId;
                        if (!activeOrganizationId) {
                            // F14: "every user has an org" invariant violated after self-heal.
                            // This is an anomaly worth alerting on, not a silent pass — Sentry
                            // will capture the error-level log.
                            console.error(`[session→org] user ${session.userId} has NO active org after self-heal — invariant violated`);
                            return; // no override; app tolerates a null active org via RBAC 403
                        }
                        return {
                            data: {
                                ...session,
                                activeOrganizationId,
                            },
                        };
                    },
                },
            },
        },
        secondaryStorage: cacheClient,
        // Rate limiting SHARED across serverless instances: storage on
        // secondary-storage (Upstash via cacheClient) instead of the default
        // in-memory (per-instance, reset on every Vercel cold start).
        // enabled is Better Auth's default (active in production); the
        // customRules tighten brute-force-sensitive paths. NB: path keys
        // are the REAL Better Auth 1.4.x endpoints (request-password-reset,
        // not forget-password) — verified in the source.
        rateLimit: {
            storage: "secondary-storage",
            window: 60,
            max: 100,
            customRules: {
                // Match (not loosen) Better Auth's built-in special rule for
                // /sign-in* (window 10, max 3). customRules are applied LAST and
                // win, so the previous { window: 60, max: 10 } silently RAISED the
                // burst ceiling from 3→10 guesses/IP — the opposite of tightening.
                "/sign-in/email": { window: 10, max: 3 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
                // F9: /change-email returns a distinct 422 for an already-registered target
                // (library default), enabling enumeration. Rate-limit to bound it.
                "/change-email": { window: 60, max: 5 },
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            // Security review F3: a user who resets their password (often BECAUSE they
            // suspect compromise) must not leave the attacker's existing session alive.
            // Better Auth only calls deleteSessions(userId) on reset when this is set
            // (api-CkmycQ2x.mjs:1946).
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
                const language = ((user as { locale?: string }).locale as SupportedLanguage) || 'it';
                const result = await sendEmail({
                    type: "reset_password",
                    to: user.email,
                    userId: user.id,
                    resetUrl: url,
                    userName: user.name || undefined,
                    language,
                });

                if (!result.success) {
                    throw createError({
                        statusCode: 500,
                        statusMessage: "Internal Server Error",
                    });
                }
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            // Security review F4: the verification token is a stateless HS256 JWT with no
            // single-use DB record (api-CkmycQ2x.mjs:1260) → replayable until expiry (~1h).
            // With auto-sign-in ON, a leaked verification URL granted repeated account access.
            // Require an explicit login after verification instead.
            autoSignInAfterVerification: false,
            sendVerificationEmail: async ({ user, url }, request) => {
                const language = ((user as { locale?: string }).locale as SupportedLanguage) || 'it';
                const result = await sendEmail({
                    type: "verification",
                    to: user.email,
                    userId: user.id,
                    verificationUrl: url,
                    userName: user.name || undefined,
                    language,
                });

                if (!result.success) {
                    // Send as a side-effect (sign-up, sign-in with unverified email):
                    // the user is ALREADY committed to DB before this callback → a throw
                    // would produce a 500 with the account created ("email already registered" on retry).
                    // Do not block the flow: log + self-service resend.
                    // Only on the explicit /send-verification-email endpoint (where sending IS
                    // the requested operation) should failure become an HTTP error.
                    const path = request ? new URL(request.url).pathname : "";
                    if (!path.endsWith("/send-verification-email")) {
                        console.error(`[Email] Verification email not sent to ${user.email} (flow not blocked, resend possible): ${result.error}`);
                        return;
                    }
                    throw createError({
                        statusCode: 500,
                        statusMessage: "Internal Server Error",
                    });
                }
            },
        },
        socialProviders: {
            google: {
                clientId: runtimeConfig.googleClientId!,
                clientSecret: runtimeConfig.googleClientSecret!,
            },
        },
        account: {
            accountLinking: {
                // Auto-linking of a pre-existing account is DISABLED (security review F1):
                // Better Auth only checks the INCOMING provider email's verification, never
                // whether the pre-existing LOCAL credential row was verified. With linking on,
                // an attacker who pre-registers victim@gmail.com (unverified, no session) has
                // that row adopted — and flipped to emailVerified=true — when the real victim
                // later signs in with Google (api-CkmycQ2x.mjs:826,852). Google and
                // email/password are now distinct sign-in methods keyed on one primary credential.
                enabled: false,
            },
        },
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                // F5: re-check ban freshness from the DB on org/admin/creem Better Auth
                // sub-paths (reads included) that the app middleware does not cover.
                // Fail-CLOSED here (unlike getAuthSession's fail-open): these endpoints
                // are low-volume, so a transient DB error blocking them is acceptable.
                if (!shouldBanGuardPath(ctx.path)) return;
                // At before-hook time ctx.context.session is still null: runBeforeHooks runs
                // BEFORE the endpoint's own session middleware (api-CkmycQ2x.mjs:2921 seeds
                // session:null, :2928 runs before-hooks, :2951 runs the endpoint). Resolve it
                // explicitly. getSessionFromCtx caches onto ctx.context.session, so the
                // endpoint's own sessionMiddleware reuses it (session-AaRl3_x-.mjs:226) — no
                // double fetch — and returns null (not throwing) for unauthenticated requests.
                const session = await getSessionFromCtx(ctx);
                const userId = session?.user?.id;
                if (!userId) return; // unauthenticated → plugin's own guard handles it
                if (await isUserBannedFresh(userId)) {
                    throw new APIError("FORBIDDEN", { message: "Account banned" });
                }
            }),
            after: createAuthMiddleware(async (ctx) => {
                const AUTH_PATH_MAP: Record<string, AuditAction> = {
                    '/sign-in/email': 'auth.signed_in',
                    '/sign-up/email': 'auth.signed_up',
                    // F6: real Better Auth 1.4.5 endpoint is /request-password-reset
                    // (api-CkmycQ2x.mjs:1804); /forget-password does not exist in this version.
                    '/request-password-reset': 'auth.password_reset_requested',
                    '/reset-password': 'auth.password_reset_completed',
                };

                const ipAddress = ctx.getHeader("x-forwarded-for") ||
                    ctx.getHeader("remoteAddress") || undefined;
                const userAgent = ctx.getHeader("user-agent") || undefined;

                let targetType;
                let targetId;
                if (ctx.context.session || ctx.context.newSession) {
                    targetType = "user";
                    targetId = ctx.context.session?.user.id ||
                        ctx.context.newSession?.user.id;
                } else if (
                    ["/sign-in/email", "/sign-up/email", "/request-password-reset"]
                        .includes(ctx.path)
                ) {
                    targetType = "email";
                    targetId = ctx.body?.email || "";
                }
                const returned = ctx.context.returned;
                if (returned && returned instanceof APIError) {
                    const userId = ctx.context.newSession?.user.id;
                    if (
                        ctx.path == "/callback/:id" &&
                        returned.status == "FOUND" && userId
                    ) {
                        const provider = ctx.params.id;
                        await logAudit(null, 'auth.oauth_callback', {
                            userId,
                            targetType,
                            targetId,
                            ipAddress,
                            userAgent,
                            status: "success",
                            details: { provider },
                        });
                    } else {
                        await logAudit(null, 'auth.failed', {
                            userId: ctx.context.session?.user.id,
                            targetType,
                            targetId,
                            ipAddress,
                            userAgent,
                            status: "failure",
                            details: { path: ctx.path, error: returned.body?.message },
                        });
                    }
                } else {
                    const action = AUTH_PATH_MAP[ctx.path];
                    if (action) {
                        let userId: string | undefined;
                        if (ctx.path === "/sign-in/email") {
                            userId = ctx.context.newSession?.user.id;
                        } else if (ctx.path === "/sign-up/email") {
                            // F7: under requireEmailVerification, sign-up returns no session
                            // (newSession is undefined). Resolve the just-created user by email
                            // so auth.signed_up and auth.tos_accepted attribute correctly.
                            const email = ctx.body?.email as string | undefined;
                            if (email) {
                                try {
                                    const db = getDB();
                                    const rows = await db
                                        .select({ id: schema.user.id })
                                        .from(schema.user)
                                        .where(eq(schema.user.email, email))
                                        .limit(1);
                                    userId = rows[0]?.id;
                                } catch (err) {
                                    // Audit attribution is best-effort: a transient DB error here
                                    // must not break the sign-up response (Better Auth re-throws
                                    // non-APIError from after-hooks). Degrade to undefined userId.
                                    console.error("[audit] sign-up userId lookup failed:", err);
                                }
                            }
                        } else {
                            userId = ctx.context.session?.user.id;
                        }
                        await logAudit(null, action, {
                            userId,
                            targetType,
                            targetId,
                            ipAddress,
                            userAgent,
                            status: "success",
                        });

                        if (ctx.path === "/sign-up/email" && userId) {
                            await logAudit(null, 'auth.tos_accepted', {
                                userId,
                                targetType: "user",
                                targetId: userId,
                                ipAddress,
                                userAgent,
                                status: "success",
                                details: { message: "ToS accepted at registration" },
                            });
                        }
                    }
                }
            }),
        },
        plugins: [
            ...(runtimeConfig.public.appEnv === "development"
                ? [openAPI()]
                : []),
            // SECURITY (F8): the admin() plugin mounts impersonate/set-role/ban under
            // /api/auth/admin/* (role-gated: adminRoles=["admin"], admin-D-OMdNIc.mjs:75),
            // a SEPARATE control plane from the API-key-gated /api/admin routes. role="admin"
            // is input:false at signup (not self-escalatable). Access requires a web-login
            // by an admin-role user. If admins are DB-only and never web-authenticate, this
            // surface is inert; otherwise restrict via adminUserIds allowlist + step-up.
            admin(),
            organization({
                sendInvitationEmail: async (data) => {
                    const inviterUser = data.inviter.user as { locale?: string; name?: string };
                    const language = (inviterUser.locale as SupportedLanguage) || "it";
                    const inviteUrl = `${runtimeConfig.public.baseURL}/invite/${data.id}`;
                    const result = await sendEmail({
                        type: "invitation",
                        to: data.email,
                        inviteUrl,
                        orgName: data.organization.name,
                        invitedByName: inviterUser.name || data.organization.name,
                        language,
                    });
                    if (!result.success) {
                        console.error(
                            `[org.sendInvitationEmail] send failed to ${data.email}: ${result.error}`,
                        );
                    }
                    // data.id IS the invitation id (better-auth passes id: invitation.id).
                    // afterCreateInvitation reads this in the same request to reflect the
                    // real delivery outcome in the audit; see inviteDeliveryStatus above.
                    inviteDeliveryStatus.set(data.id, result.success);
                },
                organizationHooks: {
                    afterCreateInvitation: async (data) => {
                        // Fail-open default (true): if better-auth's hook ordering ever
                        // changes upstream, we degrade to today's always-success behavior
                        // rather than false-alarming a delivery failure that didn't happen.
                        const delivered = inviteDeliveryStatus.get(data.invitation.id) ?? true;
                        inviteDeliveryStatus.delete(data.invitation.id);
                        await logInviteAudit(
                            {
                                invitationId: data.invitation.id,
                                email: data.invitation.email,
                                inviterId: data.inviter.id,
                                organizationId: data.organization.id,
                                role: data.invitation.role,
                            },
                            delivered,
                        );
                    },
                    afterAcceptInvitation: async (data) => {
                        await logAudit(null, "team.invite_accepted", {
                            userId: data.user.id,
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.user.id,
                            status: "success",
                            details: { role: data.member.role, invitationId: data.invitation.id },
                        });
                    },
                    afterRemoveMember: async (data) => {
                        await logAudit(null, "team.member_removed", {
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.member.userId,
                            status: "success",
                        });
                    },
                    afterUpdateMemberRole: async (data) => {
                        await logAudit(null, "team.permissions_updated", {
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.member.userId,
                            status: "success",
                            details: { previousRole: data.previousRole, newRole: data.member.role },
                        });
                    },
                },
            }),
            // SECURITY (F2): the twoFactor challenge hook matches only /sign-in/{email,
            // username,phone-number} (two-factor-BDQvVILL.mjs:872), NOT the OAuth callback
            // or verification paths. Auto-linking is disabled (F1), which removes the
            // linked-2FA-account bypass precondition TODAY. If /link-social is ever exposed
            // from settings, add a 2FA step-up on the OAuth-callback path before re-enabling.
            twoFactor({
                issuer: runtimeConfig.public.appName || "SaaS App",
                backupCodeOptions: { amount: 10 },
            }),
            setupCreem(),
        ],
    });

let _auth: ReturnType<typeof createBetterAuth>;

// Used by npm run auth:schema only.
const isAuthSchemaCommand = process.argv.some((arg) =>
    arg.includes("server/database/schema/auth.ts")
);
if (isAuthSchemaCommand) {
    _auth = createBetterAuth();
}
export const auth = _auth!;

export const useServerAuth = () => {
    if (runtimeConfig.preset == "node-server") {
        if (!_auth) {
            _auth = createBetterAuth();
        }
        return _auth;
    } else {
        return createBetterAuth();
    }
};

export const getAuthSession = async (event: H3Event<EventHandlerRequest>) => {
    const headers = event.headers;
    const serverAuth = useServerAuth();
    const session = await serverAuth.api.getSession({
        headers,
    });

    // Immediate ban/deletion revocation: the cached session can outlive a failed
    // secondaryStorage revocation (e.g. an Upstash blip at ban time), so re-check
    // the ban flag from the DB (source of truth) — the cached session.user.banned
    // would be stale. FAIL-OPEN on a check error: 1.auth.ts wraps this in a silent
    // try/catch, so letting a transient DB error propagate would 401 EVERY user on
    // that request. A banned user slipping through a DB blip is rare and self-heals.
    if (session?.user?.id) {
        try {
            if (await isUserBannedFresh(session.user.id)) {
                return null;
            }
        } catch (err) {
            console.error(`[auth] ban re-check failed for user ${session.user.id}; allowing (fail-open):`, err);
        }
    }

    return session;
};

export const requireAuth = async (event: H3Event<EventHandlerRequest>) => {
    // If auth middleware already injected user, return it directly
    if (event.context.user?.id) {
        return event.context.user as User;
    }

    const session = await getAuthSession(event);
    if (!session || !session.user) {
        throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized",
        });
    }
    // Save the session to the event context for later use
    // Cast to User - better-auth may not return all fields but we know they exist in DB
    const user = session.user as unknown as User;
    event.context.user = user;
    return user;
};
