import { useServerAuth } from "~~/server/utils/auth";
import { getServerSiteMode } from "~~/server/utils/siteMode";

export default defineEventHandler(async (event) => {
    const path = getRequestURL(event).pathname;

    // Always allow webhook requests (they come from Creem servers)
    const isWebhook = path.includes('/creem/webhook');

    if (isWebhook) {
        console.log(`[Creem Webhook] Received request at ${path}`);
    }

    // Auth disabled outside "active". Same authority as the middleware
    // (Redis override → env): a runtime toggle consistently opens/closes auth.
    if (!isWebhook && (await getServerSiteMode()) !== "active") {
        return;
    }

    const serverAuth = useServerAuth();
    const response = await serverAuth.handler(toWebRequest(event));

    if (isWebhook) {
        console.log(`[Creem Webhook] Response status: ${response?.status || 'no response'}`);
    }

    return response;
});
