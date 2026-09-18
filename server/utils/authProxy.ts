/**
 * Task 4 (migration), Step 2: same-origin proxy of `/api/auth/*` to the Convex
 * deployment that now owns Better Auth.
 *
 * This module is the transport, not the decision maker: it forwards method,
 * path, query, headers and raw body and returns status, headers and body
 * untouched. Better Auth (inside Convex) keeps every authority — session
 * validation, trusted origins, rate limiting, cookie policy.
 *
 * Mirrors the official `@convex-dev/better-auth` Next.js handler, including the
 * `x-better-auth-forwarded-*` hint headers the component uses to reconstruct
 * the browser-facing origin (`restoreOriginalForwardedHeaders`).
 */

export interface AuthProxyRequest {
    method: string;
    /** Path only, e.g. `/api/auth/get-session`. */
    path: string;
    /** Query string including the leading `?`, or empty. */
    search: string;
    /** Browser-facing host (`localhost:3000`), never used to pick the upstream. */
    host: string;
    protocol: "http" | "https";
    headers: Headers;
    /**
     * Explicitly `ArrayBuffer`-backed: TypeScript 5.7+ makes
     * `Uint8Array<ArrayBufferLike>` unassignable to `BodyInit`, so callers hand
     * over a copy on a plain ArrayBuffer (see the auth route).
     */
    body?: Uint8Array<ArrayBuffer> | null;
}

export interface AuthProxyResponse {
    status: number;
    /** Ordered header list: repeated `set-cookie` entries stay separate. */
    headers: Array<[string, string]>;
    body: Uint8Array<ArrayBuffer> | null;
}

export interface AuthProxyOptions {
    /** Convex HTTP actions origin (`https://<deployment>.convex.site`). */
    siteUrl: string;
    fetchImpl?: typeof fetch;
}

/**
 * Hop-by-hop and framing headers must not be copied: `fetch` already
 * decompressed the body, so forwarding `content-encoding`/`content-length`
 * would describe a payload the client never receives.
 */
const STRIPPED_HEADERS = new Set([
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
]);

/**
 * Refuses to proxy to anything but a Convex site origin. A `.convex.cloud` URL
 * is the *client* (websocket) origin and would silently answer 404 for every
 * auth call, so it fails here instead.
 */
export function resolveConvexSiteUrl(siteUrl: string | undefined): string {
    if (!siteUrl) {
        throw new Error(
            "NUXT_PUBLIC_CONVEX_SITE_URL is not set: the auth proxy has no upstream deployment",
        );
    }

    if (siteUrl.endsWith(".convex.cloud")) {
        throw new Error(
            `NUXT_PUBLIC_CONVEX_SITE_URL must be the Convex site URL (.convex.site), got ${siteUrl}`,
        );
    }

    return siteUrl.replace(/\/+$/, "");
}

export async function proxyAuthRequest(
    request: AuthProxyRequest,
    options: AuthProxyOptions,
): Promise<AuthProxyResponse> {
    const siteUrl = resolveConvexSiteUrl(options.siteUrl);
    const doFetch = options.fetchImpl ?? fetch;

    const headers = new Headers(request.headers);
    for (const header of STRIPPED_HEADERS) {
        headers.delete(header);
    }
    headers.set("accept-encoding", "application/json");
    headers.set("host", new URL(siteUrl).host);
    headers.set("x-forwarded-host", request.host);
    headers.set("x-forwarded-proto", request.protocol);
    headers.set("x-better-auth-forwarded-host", request.host);
    headers.set("x-better-auth-forwarded-proto", request.protocol);

    // A body is only sent when there is one: an empty POST would otherwise be
    // framed as `transfer-encoding: chunked` and rejected upstream.
    const bodyBytes = request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body ?? undefined;

    const upstream = await doFetch(`${siteUrl}${request.path}${request.search}`, {
        method: request.method,
        headers,
        body: bodyBytes && bodyBytes.byteLength > 0 ? bodyBytes : undefined,
        // OAuth callbacks answer 302 with Set-Cookie; following them server-side
        // would swallow the cookies and lose the redirect.
        redirect: "manual",
    });

    const responseHeaders: Array<[string, string]> = [];
    for (const [key, value] of upstream.headers) {
        if (STRIPPED_HEADERS.has(key.toLowerCase())) continue;
        responseHeaders.push([key, value]);
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer());


    return {
        status: upstream.status,
        headers: responseHeaders,
        body: buffer.byteLength > 0 ? buffer : null,
    };
}
