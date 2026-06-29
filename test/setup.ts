import { config } from "dotenv";

// 1) Load .env into process.env BEFORE test modules import
//    server/utils/runtimeConfig.ts. runtimeConfig.ts, outside the Nuxt context,
//    calls config()+generateRuntimeConfig() reading process.env.NUXT_DATABASE_URL:
//    this lets getDB() reach the Neon dev branch without --env-file.
config();

// 2) Fallback defaults for tests that don't have these values in .env
//    (||= fills only missing keys, does not overwrite .env).
process.env.NUXT_PUBLIC_APP_NAME ||= "Ceremly";
process.env.NUXT_PUBLIC_APP_NOTIFY_EMAIL ||= "noreply@airowlgasga.dev";
process.env.NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL ||= "inviti@events.airowlgasga.dev";
process.env.NUXT_RESEND_API_KEY ||= "re_test";
process.env.NUXT_RESEND_WEBHOOK_SECRET ||= "whsec_test";

// 3) createError is a Nitro auto-import (h3 does not expose it as a named export in
//    this version → no import). The services under test
//    (createGuest/createEvent/saveReminders) call it for 402/422.
//    Polyfill compatible with h3's createError: error with statusCode/statusMessage.
//    NB: do NOT polyfill useRuntimeConfig — it would shadow runtimeConfigInstance and
//    leave databaseUrl undefined, breaking DB-backed tests.
type CreateErrorInput =
    | string
    | { statusCode?: number; statusMessage?: string; message?: string };

const g = globalThis as Record<string, unknown>;
if (typeof g.createError !== "function") {
    g.createError = (input: CreateErrorInput) => {
        const opts = typeof input === "string" ? { statusMessage: input } : input;
        const err = new Error(opts.statusMessage ?? opts.message ?? "Error") as Error & {
            statusCode?: number;
            statusMessage?: string;
        };
        if (opts.statusCode !== undefined) err.statusCode = opts.statusCode;
        if (opts.statusMessage !== undefined) err.statusMessage = opts.statusMessage;
        return err;
    };
}
