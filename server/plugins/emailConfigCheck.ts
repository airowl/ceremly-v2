import { runtimeConfig } from "~~/server/utils/runtimeConfig";

/**
 * Startup guard: in a production deployment, loudly log any missing email/webhook
 * env so a misconfigured deploy is visible immediately instead of silently dropping
 * webhook events or sending from a malformed `from`.
 */
export default defineNitroPlugin(() => {
    if (!runtimeConfig.public.isProdDeployment) return;
    const missing: string[] = [];
    if (!runtimeConfig.resendWebhookSecret) missing.push("NUXT_RESEND_WEBHOOK_SECRET");
    if (!runtimeConfig.resendApiKey) missing.push("NUXT_RESEND_API_KEY");
    if (!runtimeConfig.public.appNotifyEmail) missing.push("appNotifyEmail");
    if (!runtimeConfig.public.appEventsNotifyEmail) missing.push("appEventsNotifyEmail");
    if (missing.length) {
        console.error(`[startup] Missing production email config: ${missing.join(", ")}`);
    }
});
