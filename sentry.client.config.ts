import * as Sentry from "@sentry/nuxt";

// Sentry lato CLIENT. Il DSN (pubblico per design) arriva dal public runtime
// config (NUXT_PUBLIC_SENTRY_DSN). Init SOLO se il DSN è configurato → no-op
// pulito finché non si fornisce la chiave, nessun rumore in dev/CI.
const publicConfig = useRuntimeConfig().public as { sentry?: { dsn?: string } };
const dsn = publicConfig.sentry?.dsn;

if (dsn) {
    Sentry.init({
        dsn,
        // GDPR: nessun PII di default (no IP, no headers/cookie sensibili).
        sendDefaultPii: false,
        // Tracing leggero (10%): error monitoring è l'obiettivo, non l'APM full.
        tracesSampleRate: 0.1,
        // Niente Session Replay (privacy + quota free tier).
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
    });
}
