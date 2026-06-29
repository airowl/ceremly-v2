/**
 * Boot-time env validation (#17). Without this, a missing secret does not
 * fail at boot but at the FIRST request that uses it (`neon(undefined)` throws,
 * `betterAuthSecret: undefined` breaks session signing...) → scattered opaque 500s
 * instead of a clear, immediate error.
 *
 * In PRODUCTION a missing critical secret is fatal (throw → boot fails with
 * the list of missing keys, better than per-request 500s). In dev it is
 * only a warning, so a locally incomplete `.env` doesn't block development.
 */

/** Secrets without which the app is fundamentally broken in production. */
const REQUIRED_ENV = [
    "NUXT_DATABASE_URL",
    "NUXT_BETTER_AUTH_SECRET",
    "NUXT_PUBLIC_BASE_URL",
    // Cache / sessions / rate-limit (Better Auth secondaryStorage)
    "NUXT_UPSTASH_REDIS_REST_URL",
    "NUXT_UPSTASH_REDIS_REST_TOKEN",
    // R2 Storage (dereferenced with `!` in runtimeConfig → crash at runtime)
    "NUXT_CF_ACCOUNT_ID",
    "NUXT_CF_ACCESS_KEY_ID",
    "NUXT_CF_SECRET_ACCESS_KEY",
    "NUXT_CF_R2_BUCKET_NAME",
    "NUXT_CF_R2_PUBLIC_URL",
    // Email
    "NUXT_RESEND_API_KEY",
    // Queue (jobs) — consumer signing + publish
    "NUXT_QSTASH_TOKEN",
    "NUXT_QSTASH_CURRENT_SIGNING_KEY",
    "NUXT_QSTASH_NEXT_SIGNING_KEY",
    // Billing
    "NUXT_CREEM_API_KEY",
    "NUXT_CREEM_WEBHOOK_SECRET",
    // Admin
    "NUXT_ADMIN_API_KEY",
] as const;

export default defineNitroPlugin(() => {
    // During prerender (static page build) there is no application runtime or
    // deploy secrets: skip validation, otherwise a CI build without env vars
    // would fail spuriously.
    if (import.meta.prerender) return;

    const missing = REQUIRED_ENV.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === "";
    });

    if (missing.length === 0) return;

    const message = `[env] Required environment variables missing or empty: ${missing.join(", ")}`;

    if (process.env.NODE_ENV === "production") {
        // Fail-fast: the boot must fail CLEARLY, not degrade into opaque 500s.
        throw new Error(message);
    }

    console.warn(`${message}\n(dev: warning only — in production this would be a boot error)`);
});
