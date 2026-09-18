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

export const createAuth = (ctx: GenericCtx<DataModel>) =>
    betterAuth({
        baseURL: siteUrl(),
        secret: requireEnv("BETTER_AUTH_SECRET"),
        database: authComponent.adapter(ctx),
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
