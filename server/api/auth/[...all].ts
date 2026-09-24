import { useServerAuth } from "~~/server/utils/auth";
import { getServerSiteMode } from "~~/server/utils/siteMode";
import { isAuthCatchAllOpen } from "~~/shared/constants/siteMode";
import { proxyAuthRequest, resolveConvexSiteUrl } from "~~/server/utils/authProxy";
import { runtimeConfig } from "~~/server/utils/runtimeConfig";

export default defineEventHandler(async (event) => {
    const url = getRequestURL(event);
    const path = url.pathname;

    // Always allow webhook requests (they come from Creem servers)
    const isWebhook = path.includes('/creem/webhook');

    if (isWebhook) {
        console.log(`[Creem Webhook] Received request at ${path}`);
    }

    // Auth disabilitata fuori da "active". Stessa authority del middleware
    // (Redis override → env): un toggle runtime chiude/riapre auth coerentemente.
    // Eccezioni: il webhook Creem, le API di sessione del break-glass della console
    // admin (Task 15), e `maintenance-readonly` (Task 17), dove il login deve
    // funzionare — lì l'enforcement è il middleware 0.site-mode, già eseguito.
    if (!isAuthCatchAllOpen(await getServerSiteMode(), path)) {
        return;
    }

    // Blue-green (migration Task 4): `NUXT_AUTH_BACKEND` decides which identity
    // backend serves `/api/auth/*`. The default stays `legacy`, so the Vercel
    // production deployment keeps its in-process Better Auth over Neon/Drizzle
    // until the cutover task flips it — no dual writes, no accidental switch.
    if (runtimeConfig.authBackend !== "convex") {
        const serverAuth = useServerAuth();
        const response = await serverAuth.handler(toWebRequest(event));

        if (isWebhook) {
            console.log(`[Creem Webhook] Response status: ${response?.status || 'no response'}`);
        }

        return response;
    }

    // The upstream is config, never the incoming Host header: a request cannot
    // point this proxy at an arbitrary origin.
    const siteUrl = resolveConvexSiteUrl(runtimeConfig.public.convexSiteUrl);
    const body = await readRawBody(event, false);
    const protocol = url.protocol.replace(":", "");

    const response = await proxyAuthRequest(
        {
            method: event.method,
            path,
            search: url.search,
            host: url.host,
            protocol: protocol === "https" ? "https" : "http",
            headers: new Headers(getRequestHeaders(event) as Record<string, string>),
            // Copy onto a plain ArrayBuffer: Node's `Buffer` is
            // `Uint8Array<ArrayBufferLike>`, which `fetch` no longer accepts.
            body: body ? new Uint8Array(body) : null,
        },
        { siteUrl },
    );

    setResponseStatus(event, response.status);

    // Appended one by one: `Set-Cookie` must stay a list (the 2FA and OAuth
    // callbacks return more than one) and must never be comma-joined.
    for (const [name, value] of response.headers) {
        appendResponseHeader(event, name, value);
    }

    return response.body ? Buffer.from(response.body) : null;
});
