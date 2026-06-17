/**
 * Validazione env a BOOT-TIME (#17). Senza questo, un secret mancante non
 * fallisce al boot ma alla PRIMA richiesta che lo usa (`neon(undefined)` throwa,
 * `betterAuthSecret: undefined` rompe il signing sessione...) → 500 opachi
 * sparsi invece di un errore chiaro e immediato.
 *
 * In PRODUZIONE un secret critico mancante è fatale (throw → il boot fallisce
 * con la lista delle chiavi mancanti, meglio che 500 per-richiesta). In dev è
 * solo un warning, per non bloccare un `.env` incompleto in locale.
 */

/** Secret senza i quali l'app è fondamentalmente rotta in produzione. */
const REQUIRED_ENV = [
    "NUXT_DATABASE_URL",
    "NUXT_BETTER_AUTH_SECRET",
    "NUXT_PUBLIC_BASE_URL",
    // Cache / sessioni / rate-limit (Better Auth secondaryStorage)
    "NUXT_UPSTASH_REDIS_REST_URL",
    "NUXT_UPSTASH_REDIS_REST_TOKEN",
    // Storage R2 (dereferenziati con `!` in runtimeConfig → rompono a runtime)
    "NUXT_CF_ACCOUNT_ID",
    "NUXT_CF_ACCESS_KEY_ID",
    "NUXT_CF_SECRET_ACCESS_KEY",
    "NUXT_CF_R2_BUCKET_NAME",
    "NUXT_CF_R2_PUBLIC_URL",
    // Email
    "NUXT_RESEND_API_KEY",
    // Queue (jobs) — firma del consumer + publish
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
    // In prerender (build delle pagine statiche) non c'è runtime applicativo né
    // i secret di deploy: non validare, altrimenti una build in CI senza env
    // fallirebbe spuriamente.
    if (import.meta.prerender) return;

    const missing = REQUIRED_ENV.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === "";
    });

    if (missing.length === 0) return;

    const message = `[env] Variabili d'ambiente richieste mancanti o vuote: ${missing.join(", ")}`;

    if (process.env.NODE_ENV === "production") {
        // Fail-fast: il boot deve fallire CHIARO, non degradare in 500 opachi.
        throw new Error(message);
    }

    console.warn(`${message}\n(dev: solo warning — in produzione sarebbe un errore di boot)`);
});
