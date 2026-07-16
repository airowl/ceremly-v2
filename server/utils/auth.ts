import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { User } from "~~/shared/utils/types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, openAPI, organization, twoFactor } from "better-auth/plugins";
import { v7 as uuidv7 } from "uuid";
import * as schema from "../database/schema";
import { asc, eq } from "drizzle-orm";
import type { SupportedLanguage } from "../emailTemplates";
import { logAudit } from "./audit";
import type { AuditAction } from "./audit/types";
import { getDB } from "./db";
import { isUserBannedFresh } from "./banStatus";
import { cacheClient } from "./drivers";
import { sendEmail } from "./email";
import { deriveOrgNameFromUser, generateUniqueOrgSlug } from "../services/org.service";
import { setupCreem } from "./creem";
import { runtimeConfig } from "./runtimeConfig";

if (import.meta.dev) {
    console.log(`Base URL is ${runtimeConfig.public.baseURL}`);
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
                                    rows = await findFirstOrg();
                                }
                            } catch (err) {
                                // Do not block login: without an active org, the app handles the fallback.
                                console.error(`[session→org self-heal] createOrganization failed for user ${session.userId}:`, err);
                            }
                        }

                        const activeOrganizationId = rows[0]?.organizationId;
                        if (!activeOrganizationId) {
                            return; // no org (anomalous state) → no override
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
            autoSignInAfterVerification: true,
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
            after: createAuthMiddleware(async (ctx) => {
                const AUTH_PATH_MAP: Record<string, AuditAction> = {
                    '/sign-in/email': 'auth.signed_in',
                    '/sign-up/email': 'auth.signed_up',
                    '/forget-password': 'auth.password_reset_requested',
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
                    ["/sign-in/email", "/sign-up/email", "forget-password"]
                        .includes(ctx.path)
                ) {
                    targetType = "email";
                    targetId = ctx.body.email || "";
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
                        if (
                            ["/sign-in/email", "/sign-up/email"].includes(
                                ctx.path,
                            )
                        ) {
                            userId = ctx.context.newSession?.user.id;
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
                },
                organizationHooks: {
                    afterCreateInvitation: async (data) => {
                        await logAudit(null, "team.member_invited", {
                            userId: data.inviter.id,
                            organizationId: data.organization.id,
                            targetType: "email",
                            targetId: data.invitation.email,
                            status: "success",
                            details: { role: data.invitation.role, invitationId: data.invitation.id },
                        });
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
