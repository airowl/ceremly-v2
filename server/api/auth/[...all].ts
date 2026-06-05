import { useServerAuth } from "~~/server/utils/auth";

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const path = getRequestURL(event).pathname;

    // Always allow webhook requests (they come from Creem servers)
    const isWebhook = path.includes('/creem/webhook');

    if (isWebhook) {
        console.log(`[Creem Webhook] Received request at ${path}`);
    }

    if (config.public.siteMode !== "active" && !isWebhook) {
        return;
    }

    const serverAuth = useServerAuth();
    const response = await serverAuth.handler(toWebRequest(event));

    if (isWebhook) {
        console.log(`[Creem Webhook] Response status: ${response?.status || 'no response'}`);
    }

    return response;
});
