import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { isQueryCtx } from "@convex-dev/better-auth/utils";
import { twoFactor } from "better-auth/plugins/two-factor";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireEnv, siteUrl } from "./lib/env";
import authConfig from "./auth.config";

// Task 4 (migration): Better Auth is the only identity provider. It runs inside
// Convex and stores users/sessions/accounts/2FA in the `betterAuth` component.
//
// Component constraints that shape this file (measured, not assumed):
// - the component ships a fixed schema (`@convex-dev/better-auth/src/component/schema.ts`):
//   the user table has no `role`/`banned` columns and accepts no custom fields
//   (`adapter.create` validates `data` against `v.object(<table fields>)`).
//   Therefore the `admin` plugin and `user.additionalFields` are NOT enabled
//   here: `globalRole`, `locale` and profile fields live in the app-owned
//   `appUsers`/profile tables (plan Tasks 5, 10, 12).
// - the `organization` plugin is intentionally absent (plan: organizations are
//   application domain, resolved server-side in Task 5).
export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Schedules an auth email (verification / reset / change-email confirmation).
 *
 * Fire-and-forget on purpose: Better Auth calls these callbacks as a side
 * effect *after* the user row is committed, so a throw here would turn a valid
 * sign-up into a 500 (the legacy implementation documented the same trap).
 * Delivery errors stay visible in the Convex logs and, from Task 13 on, in
 * `jobExecutions` with retry/DLQ.
 */
const scheduleAuthEmail = (
    ctx: GenericCtx<DataModel>,
    email: { to: string; subject: string; url: string; body: string },
) => {
    // Narrowing away the query context is what makes `scheduler` reachable:
    // a query could never legitimately send mail, so refusing is correct.
    if (isQueryCtx(ctx)) {
        throw new Error("createAuth needs a mutation or action context to schedule emails");
    }

    void ctx.scheduler.runAfter(0, internal.email.sendAuthEmail, email);
};

const scheduleAppUserProvisioning = (
    ctx: GenericCtx<DataModel>,
    user: { id: string; email: string; name?: string | null },
) => {
    if (isQueryCtx(ctx)) {
        return;
    }

    try {
        void ctx.scheduler.runAfter(0, internal.organizations.provisionAuthUser, {
            authUserId: user.id,
            email: user.email,
            ...(user.name ? { name: user.name } : {}),
        });
    } catch (error) {
        // See the comment on `databaseHooks` below: never fail a sign-up here.
        console.error("[auth] unable to schedule app user provisioning", error);
    }
};

export const createAuth = (ctx: GenericCtx<DataModel>) =>
    betterAuth({
        baseURL: siteUrl(),
        secret: requireEnv("BETTER_AUTH_SECRET"),
        database: authComponent.adapter(ctx),
        /**
         * Brute-force protection (plan Task 8, spike G09).
         *
         * Ported from the legacy server (`server/utils/auth.ts`) because the
         * migration would otherwise have *lost* it: with no `rateLimit` block,
         * Better Auth falls back to its own defaults — `window: 10`, `max: 100`,
         * and `storage: "memory"`. On serverless, memory is per isolate: the
         * counter resets on every cold start and is not shared, which is not a
         * limiter. The legacy deploy avoided that with `storage:
         * "secondary-storage"` (Upstash); the Convex equivalent is
         * `"database"`, which Better Auth routes through
         * `createDatabaseStorageWrapper` → the component's own `rateLimit` table
         * (that is why the table exists), so the count is shared across isolates.
         *
         * `enabled: true` is deliberate and deviates from Better Auth's default
         * (`isProduction`): a brute-force guard that is off wherever
         * `NODE_ENV !== "production"` is a guard that can silently be absent in
         * exactly the environments where it is being rehearsed. Explicit is what
         * makes the burst test in `convex/auth.test.ts` meaningful.
         *
         * The thresholds mirror the legacy custom rules verbatim — sign-in 10/min,
         * password-reset request 5/min, reset 10/min — and the edge rule the plan's
         * matrix assigns to `/api/auth/*` (Cloudflare) still owns volumetric
         * abuse, because this limiter is keyed per IP+path and lives one hop
         * behind the proxy.
         */
        rateLimit: {
            enabled: true,
            storage: "database",
            window: 60,
            max: 100,
            customRules: {
                "/sign-in/email": { window: 60, max: 10 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
            },
        },
        // No `crossDomain`: the browser talks to the Nuxt origin and the Worker
        // forwards `/api/auth/*` to this deployment (Task 4 Step 2), so SITE_URL
        // is the canonical, same-origin baseURL.
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            sendResetPassword: async ({ user, url }) => {
                scheduleAuthEmail(ctx, {
                    to: user.email,
                    subject: "Reimposta la password",
                    url,
                    body: "Apri il link per scegliere una nuova password.",
                });
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
                scheduleAuthEmail(ctx, {
                    to: user.email,
                    subject: "Conferma il tuo indirizzo email",
                    url,
                    body: "Apri il link per confermare il tuo indirizzo email.",
                });
            },
        },
        user: {
            changeEmail: {
                enabled: true,
                // better-auth 1.6.15 types this callback loosely (the key is
                // absent from the published `.d.mts`), so the shape is pinned
                // here instead of leaking `any`.
                sendChangeEmailVerification: async ({
                    user,
                    newEmail,
                    url,
                }: {
                    user: { email: string };
                    newEmail: string;
                    url: string;
                }) => {
                    scheduleAuthEmail(ctx, {
                        to: user.email,
                        subject: "Conferma il cambio email",
                        url,
                        body: `Apri il link per confermare il passaggio a ${newEmail}.`,
                    });
                },
            },
        },
        socialProviders: {
            google: {
                clientId: requireEnv("GOOGLE_CLIENT_ID"),
                clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
            },
        },
        account: {
            accountLinking: {
                enabled: true,
            },
        },
        // Task 5 provisioning trigger. A sign-up creates the app-owned profile
        // (`appUsers`), the personal organization and its owner membership.
        //
        // Scheduled rather than inline, and wrapped: Better Auth runs `after`
        // hooks inside `runWithAdapter`, i.e. *after* the user row is written but
        // still on the request path — a throw here would turn a successful
        // sign-up into a 500. The authoritative path is the idempotent
        // `api.organizations.ensureProvisioned` called on first login, so a
        // failed schedule degrades to "provisioned at next login", never to a
        // user without an organization.
        databaseHooks: {
            user: {
                create: {
                    after: async (user: { id: string; email: string; name?: string | null }) => {
                        scheduleAppUserProvisioning(ctx, user);
                    },
                },
            },
        },
        plugins: [
            convex({ authConfig }),
            twoFactor({
                issuer: process.env.APP_NAME ?? "Ceremly",
                backupCodeOptions: { amount: 10 },
            }),
        ],
    });

// Exposed for the client boundary (`authComponent.clientApi().getAuthUser`):
// the Convex query the app uses to read the current Better Auth user.
export const { getAuthUser } = authComponent.clientApi();
