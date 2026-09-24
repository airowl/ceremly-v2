import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { isQueryCtx } from "@convex-dev/better-auth/utils";
import { twoFactor } from "better-auth/plugins/two-factor";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireEnv, siteUrl } from "./lib/env";
import authConfig from "./auth.config";
import { writesAllowed } from "./lib/writeGuard";
import type { SiteMode } from "./siteSettings";

/** Sign-up is an account write: `domain` policy of `lib/writeGuard.ts`. */
export function signUpAllowed(mode: SiteMode): boolean {
    return writesAllowed(mode, "domain");
}

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
 * The three auth emails, described by template rather than by pre-rendered body.
 *
 * Task 13 replaced the inline `{ subject, url, body }` payload with the template
 * request union: the subjects and the Italian copy used to live here as string
 * literals *and* inside the React Email templates, which is two places for the
 * same sentence. Now the copy has one home (`convex/emailTemplates`) and this file
 * only says which template and with which URL.
 */
type AuthEmailRequest =
    | { template: "verification"; to: string; verificationUrl: string; userName?: string }
    | { template: "reset-password"; to: string; resetUrl: string; userName?: string }
    | {
          template: "change-email";
          to: string;
          confirmUrl: string;
          newEmail: string;
          userName?: string;
      };

/**
 * Schedules an auth email (verification / reset / change-email confirmation).
 *
 * Fire-and-forget on purpose: Better Auth calls these callbacks as a side
 * effect *after* the user row is committed, so a throw here would turn a valid
 * sign-up into a 500 (the legacy implementation documented the same trap).
 * Delivery errors stay visible in the Convex logs.
 *
 * These three do **not** go through `jobExecutions`: the plan's job registry is the
 * set of six legacy job names (Task 13, Step 3), and an auth email has no
 * downstream consumer waiting on retry semantics — a failed verification email is
 * re-requested by the user, and the failure is already an audit row
 * (`email.failed`). A durable job here would add a type the plan does not have.
 */
const scheduleAuthEmail = (ctx: GenericCtx<DataModel>, request: AuthEmailRequest) => {
    // Narrowing away the query context is what makes `scheduler` reachable:
    // a query could never legitimately send mail, so refusing is correct.
    if (isQueryCtx(ctx)) {
        throw new Error("createAuth needs a mutation or action context to schedule emails");
    }

    void ctx.scheduler.runAfter(0, internal.email.sendTemplate, { request });
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
                    template: "reset-password",
                    to: user.email,
                    resetUrl: url,
                    ...(user.name ? { userName: user.name } : {}),
                });
            },
        },
        emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
                scheduleAuthEmail(ctx, {
                    template: "verification",
                    to: user.email,
                    verificationUrl: url,
                    ...(user.name ? { userName: user.name } : {}),
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
                    user: { email: string; name?: string | null };
                    newEmail: string;
                    url: string;
                }) => {
                    scheduleAuthEmail(ctx, {
                        template: "change-email",
                        to: user.email,
                        confirmUrl: url,
                        newEmail,
                        ...(user.name ? { userName: user.name } : {}),
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
                    // Task 17 fix round 1: the Better Auth routes are reachable on
                    // the deployment's own `.convex.site` host, bypassing the
                    // Worker's read-only gate. A sign-up is an account write, so it
                    // follows the same policy as every public mutation (`domain`):
                    // refused outside `active`. Login of existing users is untouched.
                    before: async (user: { email: string }) => {
                        const { mode } = await ctx.runQuery(internal.siteSettings.getForWorker, {});
                        if (!signUpAllowed(mode)) return false;
                        return { data: user };
                    },
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
