import * as Sentry from "@sentry/nuxt";

// Sentry lato SERVER (Nitro). Gira come istrumentazione all'avvio, prima del
// runtime config Nuxt → si legge il DSN da process.env. Init SOLO se configurato.
const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        // GDPR: nessun PII di default lato server.
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
    });
}
