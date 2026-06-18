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
import { cacheClient } from "./drivers";
import { sendEmail } from "./email";
import { canAddTeamMember, canCreateOrganization, resolveOrgOwnerId } from "../services/planLimit.service";
import { deriveOrgNameFromUser, generateUniqueOrgSlug } from "../services/org.service";
import { setupCreem } from "./creem";
import { runtimeConfig } from "./runtimeConfig";

if (import.meta.dev) {
    console.log(`Base URL is ${runtimeConfig.public.baseURL}`);
}

export const createBetterAuth = () =>
    betterAuth({
        baseURL: runtimeConfig.public.baseURL,
        // In produzione solo il baseURL è trusted. localhost e il tunnel
        // Cloudflare (effimero e riassegnabile → superficie CSRF/open-redirect se
        // rivendicato) restano SOLO in dev, dietro import.meta.dev (tree-shaked
        // a false nel build di produzione).
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
                // Step 1: la conferma è inviata all'indirizzo CORRENTE (titolare account).
                // Solo dopo il click Better Auth invia la verifica al NUOVO indirizzo
                // riusando emailVerification.sendVerificationEmail (vedi sotto).
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
                        // signup→org: crea l'organization personale (owner) per il nuovo utente.
                        // Senza headers/request: createOrganization usa body.userId (no sessione).
                        const name = deriveOrgNameFromUser({ name: user.name, email: user.email });
                        const slug = generateUniqueOrgSlug(name);
                        try {
                            const serverAuth = useServerAuth();
                            await serverAuth.api.createOrganization({
                                body: { name, slug, userId: user.id },
                            });
                        } catch (err) {
                            // Best-effort: NON rilanciare. Better Auth committa l'INSERT user PRIMA
                            // di questo hook e (sul path email/password) SENZA transazione → un throw
                            // qui produrrebbe un 500 con l'account già creato (utente orfano comunque).
                            // La garanzia "ogni utente ha un'org" è data dal self-heal in
                            // databaseHooks.session.create.before (crea l'org al primo login se manca).
                            console.error(`[signup→org] createOrganization fallita per user ${user.id} (self-heal al primo login):`, err);
                        }
                    },
                },
            },
            session: {
                create: {
                    before: async (session) => {
                        // Org attiva iniziale: prima membership (createdAt asc) dell'utente.
                        const db = getDB();
                        const findFirstOrg = async () =>
                            db
                                .select({ organizationId: schema.member.organizationId })
                                .from(schema.member)
                                .where(eq(schema.member.userId, session.userId))
                                .orderBy(asc(schema.member.createdAt))
                                .limit(1);

                        let rows = await findFirstOrg();

                        // Self-heal: se l'utente non ha org (signup→org fallito, o utente legacy
                        // pre-1b), creane una personale ORA. È la garanzia robusta di "no utente
                        // orfano", indipendente dall'atomicità del hook user.create.after.
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
                                // Non bloccare il login: senza org attiva, l'app gestisce il fallback.
                                console.error(`[session→org self-heal] createOrganization fallita per user ${session.userId}:`, err);
                            }
                        }

                        const activeOrganizationId = rows[0]?.organizationId;
                        if (!activeOrganizationId) {
                            return; // nessuna org (stato anomalo) → nessun override
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
        // Rate limiting CONDIVISO tra istanze serverless: storage su
        // secondary-storage (Upstash via cacheClient) invece del default
        // in-memory (per-istanza, resettato a ogni cold start su Vercel).
        // enabled è il default di Better Auth (attivo in produzione); i
        // customRules stringono i path sensibili al brute-force. NB: i path key
        // sono gli endpoint REALI di Better Auth 1.4.x (request-password-reset,
        // non forget-password) — verificati nei sorgenti.
        rateLimit: {
            storage: "secondary-storage",
            window: 60,
            max: 100,
            customRules: {
                "/sign-in/email": { window: 60, max: 10 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
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
                    // Invio come side-effect (sign-up, sign-in con email non verificata):
                    // l'utente è GIÀ committato in DB prima di questo callback → un throw
                    // produrrebbe un 500 con account creato ("email già registrata" al retry).
                    // Non bloccare il flusso: log + reinvio self-service.
                    // Solo sull'endpoint esplicito /send-verification-email (dove l'invio È
                    // l'operazione richiesta) il fallimento deve diventare un errore HTTP.
                    const path = request ? new URL(request.url).pathname : "";
                    if (!path.endsWith("/send-verification-email")) {
                        console.error(`[Email] Verification email non inviata a ${user.email} (flusso non bloccato, reinvio possibile): ${result.error}`);
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
                enabled: true,
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
                            `[org.sendInvitationEmail] invio fallito a ${data.email}: ${result.error}`,
                        );
                    }
                },
                organizationHooks: {
                    beforeCreateOrganization: async (data) => {
                        // Gate plan-limit org-creation. È il SOLO punto efficace: il frontend
                        // crea via client.organization.create() (endpoint plugin), non via la
                        // route POST /api/organizations → il gate nel service non basta.
                        // Mirror di beforeCreateInvitation. canCreateOrganization conta le org
                        // OWNED (role=owner): un utente nuovo/self-heal ha <limite → mai bloccato.
                        const check = await canCreateOrganization(data.user.id);
                        if (!check.allowed) {
                            throw new APIError("FORBIDDEN", {
                                message: `Organization limit reached (${check.current}/${check.limit})`,
                            });
                        }
                    },
                    beforeCreateInvitation: async (data) => {
                        const ownerId = await resolveOrgOwnerId(data.invitation.organizationId);
                        if (ownerId) {
                            const check = await canAddTeamMember(ownerId, data.invitation.organizationId);
                            if (!check.allowed) {
                                throw new APIError("FORBIDDEN", {
                                    message: `Team member limit reached (${check.current}/${check.limit})`,
                                });
                            }
                        }
                    },
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
