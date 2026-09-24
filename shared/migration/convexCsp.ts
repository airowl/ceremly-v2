/**
 * CSP `connect-src` origins for the browser Convex client (Task 14c fix round 1).
 *
 * The client opens a websocket to the deployment (`wss://<name>.convex.cloud`)
 * and may fall back to HTTPS on the same host. Only **that** deployment is
 * allowed: a `*.convex.cloud` wildcard would let an injected script exfiltrate to
 * any Convex deployment, including one an attacker owns.
 *
 * The browser never contacts the HTTP-actions origin (`.convex.site`): auth goes
 * through the same-origin `/api/auth/*` proxy and the bridges through the Worker.
 *
 * Computed at **build** time from `NUXT_PUBLIC_CONVEX_URL` (the CSP is part of the
 * built config): changing the deployment URL at runtime without a rebuild would
 * leave the CSP pointing at the old one.
 */
export function convexConnectSources(convexUrl: string | undefined): string[] {
    if (!convexUrl) return [];
    let url: URL;
    try {
        url = new URL(convexUrl);
    } catch {
        return [];
    }
    // `https:` for a real deployment; `http:` only for a local backend.
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    if (url.hostname.includes("*")) return [];

    const secure = url.protocol === "https:";
    return [`${url.protocol}//${url.host}`, `${secure ? "wss" : "ws"}://${url.host}`];
}
