import type { NitroRuntimeConfig } from "nitropack/types";
import type {
    FileManagerConfig,
} from "../services/file/types";
import { config } from "dotenv";

declare module "@nuxt/schema" {
    interface RuntimeConfig {
        fileManager: FileManagerConfig;
    }
}

let runtimeConfigInstance: NitroRuntimeConfig;

export const generateRuntimeConfig = () => {
    return {
        preset: process.env.NUXT_NITRO_PRESET,
        betterAuthSecret: process.env.NUXT_BETTER_AUTH_SECRET,
        // Creem
        creemApiKey: process.env.NUXT_CREEM_API_KEY,
        creemWebhookSecret: process.env.NUXT_CREEM_WEBHOOK_SECRET,
        creemProductIdCelebration: process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION,
        creemProductIdAtelier: process.env.NUXT_CREEM_PRODUCT_ID_ATELIER,
        // Resend
        resendApiKey: process.env.NUXT_RESEND_API_KEY,
        resendWebhookSecret: process.env.NUXT_RESEND_WEBHOOK_SECRET,
        // Contact
        contactAdminEmail: process.env.NUXT_CONTACT_ADMIN_EMAIL,
        // Github
        githubClientId: process.env.NUXT_GH_CLIENT_ID,
        githubClientSecret: process.env.NUXT_GH_CLIENT_SECRET,
        // Google
        googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET,
        // DB
        databaseUrl: process.env.NUXT_DATABASE_URL,
        // Admin API
        adminApiKey: process.env.NUXT_ADMIN_API_KEY,
        // QStash (background jobs)
        qstashToken: process.env.NUXT_QSTASH_TOKEN,
        qstashCurrentSigningKey: process.env.NUXT_QSTASH_CURRENT_SIGNING_KEY,
        qstashNextSigningKey: process.env.NUXT_QSTASH_NEXT_SIGNING_KEY,
        // Local dev: redirects publish to the QStash dev server (npx) instead of
        // the cloud — the cloud cannot callback to localhost. Empty in prod →
        // cloud default, behaviour unchanged.
        qstashUrl: process.env.NUXT_QSTASH_URL,
        // Vercel Cron
        cronSecret: process.env.NUXT_CRON_SECRET,
        // Upstash Redis (HTTP cache / Better Auth secondaryStorage)
        upstashRedisRestUrl: process.env.NUXT_UPSTASH_REDIS_REST_URL,
        upstashRedisRestToken: process.env.NUXT_UPSTASH_REDIS_REST_TOKEN,
        // AI (Mastra - uses OpenAI-compatible provider)
        openaiApiKey: process.env.NUXT_OPENAI_API_KEY,
        // File
        fileManager: {
            storage: {
                accountId: process.env.NUXT_CF_ACCOUNT_ID!,
                accessKeyId: process.env.NUXT_CF_ACCESS_KEY_ID!,
                secretAccessKey: process.env.NUXT_CF_SECRET_ACCESS_KEY!,
                bucketName: process.env.NUXT_CF_R2_BUCKET_NAME!,
                publicUrl: process.env.NUXT_CF_R2_PUBLIC_URL!,
            },
            // Without these two fields the guards in upload/presign were always
            // skipped: an authenticated user could upload arbitrary content-types
            // (text/html, octet-stream...). Safe raster allowlist
            // (NO image/svg+xml → XSS vector) — covers what the app uploads
            // (profile + event editor). 5MB aligned with the nuxt-security cap.
            maxFileSize: 5 * 1024 * 1024,
            allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
            uploadRateLimit: {
                maxUploadsPerWindow: 100,
                windowSizeMinutes: 1,
            },
        } satisfies FileManagerConfig,
        public: {
            baseURL: process.env.NUXT_PUBLIC_BASE_URL,
            appName: process.env.NUXT_PUBLIC_APP_NAME,
            twitterHandle: process.env.NUXT_PUBLIC_TWITTER_HANDLE,
            appEnv: process.env.NODE_ENV,
            // true ONLY on a Vercel Production deploy. VERCEL_ENV is auto-injected
            // (production|preview); NODE_ENV is "production" even in Preview,
            // so it cannot distinguish environments. Drives Creem's testMode.
            isProdDeployment: process.env.VERCEL_ENV === "production",
            appNotifyEmail: process.env.NUXT_PUBLIC_APP_NOTIFY_EMAIL,
            // Tracked subdomain (open+click) for event invite/reminder emails.
            appEventsNotifyEmail: process.env.NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL,
            appContactEmail: process.env.NUXT_PUBLIC_APP_CONTACT_EMAIL,
            // Legal email addresses (privacy/tos/dpa/cookie pages). Env-driven: prod @ceremly.com, dev/test @airowlgasga.dev.
            privacyEmail: process.env.NUXT_PUBLIC_PRIVACY_EMAIL || "privacy@ceremly.com",
            legalEmail: process.env.NUXT_PUBLIC_LEGAL_EMAIL || "legal@ceremly.com",
            // Sentry (error tracking). DSN is public by design; empty = Sentry off.
            sentry: { dsn: process.env.NUXT_PUBLIC_SENTRY_DSN || "" },
            creemProductIdCelebration: process.env.NUXT_CREEM_PRODUCT_ID_CELEBRATION,
            creemProductIdAtelier: process.env.NUXT_CREEM_PRODUCT_ID_ATELIER,
            siteMode: process.env.NUXT_PUBLIC_SITE_MODE || "active",
            auth: {
                redirectUserTo: "/",
                redirectGuestTo: "/login",
            },
        },
    };
};

// Check if we're in Nuxt context (useRuntimeConfig is auto-imported)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalUseRuntimeConfig = (globalThis as any).useRuntimeConfig;
if (typeof globalUseRuntimeConfig === "function") {
    runtimeConfigInstance = globalUseRuntimeConfig() as NitroRuntimeConfig;
} else {
    // for cli: npm run auth:schema
    config();
    runtimeConfigInstance = generateRuntimeConfig() as NitroRuntimeConfig;
}

export const runtimeConfig = runtimeConfigInstance;
