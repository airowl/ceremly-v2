import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";

/**
 * Client IP for rate limiting / audit. On Vercel the first hop of
 * `x-forwarded-for` is the real IP (set by the platform). Fallback to the
 * remote socket, then "unknown". Note: in environments without a trusted proxy
 * the header is spoofable — acceptable here because it feeds a best-effort limiter,
 * not strong security decisions.
 */
export function getClientIp(event: H3Event<EventHandlerRequest>): string {
    const fwd = event.node.req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.toString().split(",")[0]?.trim();
    return first || event.node.req.socket.remoteAddress || "unknown";
}
