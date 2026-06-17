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
    const nuxtEnv = process.env.NUXT_ENV?.replace(/['"]/g, "");
    const devEnv = nuxtEnv === "dev";

    return {
        preset: process.env.NUXT_NITRO_PRESET,
        betterAuthSecret: process.env.NUXT_BETTER_AUTH_SECRET,
        // Creem
        creemApiKey: process.env.NUXT_CREEM_API_KEY,
        creemWebhookSecret: process.env.NUXT_CREEM_WEBHOOK_SECRET,
        creemProductIdStarterMonth: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_MONTH,
        creemProductIdStarterYear: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_YEAR,
        creemProductIdPremiumMonth: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH,
        creemProductIdPremiumYear: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_YEAR,
        creemProductIdAgencyMonth: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH,
        creemProductIdAgencyYear: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_YEAR,
        // Resend
        resendApiKey: process.env.NUXT_RESEND_API_KEY,
        // Contact
        contactAdminEmail: process.env.NUXT_CONTACT_ADMIN_EMAIL,
        // Github
        githubClientId: process.env.NUXT_GH_CLIENT_ID,
        githubClientSecret: process.env.NUXT_GH_CLIENT_SECRET,
        // Google
        googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET,
        // DB
        redisUrl: process.env.NUXT_REDIS_URL,
        databaseUrl: process.env.NUXT_DATABASE_URL,
        // Admin API
        adminApiKey: process.env.NUXT_ADMIN_API_KEY,
        // QStash (background jobs)
        qstashToken: process.env.NUXT_QSTASH_TOKEN,
        qstashCurrentSigningKey: process.env.NUXT_QSTASH_CURRENT_SIGNING_KEY,
        qstashNextSigningKey: process.env.NUXT_QSTASH_NEXT_SIGNING_KEY,
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
            // Senza questi due campi le guard in upload/presign erano sempre
            // saltate: un utente autenticato poteva caricare content-type
            // arbitrari (text/html, octet-stream...). Allowlist raster sicura
            // (NO image/svg+xml → vettore XSS) — copre ciò che l'app carica
            // (profilo + editor evento). 5MB allineato al cap di nuxt-security.
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
            appNotifyEmail: process.env.NUXT_PUBLIC_APP_NOTIFY_EMAIL,
            appContactEmail: process.env.NUXT_PUBLIC_APP_CONTACT_EMAIL,
            creemProductIdStarterMonth: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_MONTH,
            creemProductIdStarterYear: process.env.NUXT_CREEM_PRODUCT_ID_STARTER_YEAR,
            creemProductIdPremiumMonth: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH,
            creemProductIdPremiumYear: process.env.NUXT_CREEM_PRODUCT_ID_PREMIUM_YEAR,
            creemProductIdAgencyMonth: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH,
            creemProductIdAgencyYear: process.env.NUXT_CREEM_PRODUCT_ID_AGENCY_YEAR,
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
