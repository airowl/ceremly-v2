const limits = new Map<string, { count: number; startTime: number }>();
const windowMs = 15 * 60 * 1000; // 15 minutes
const maxRequests = 100;

// Cleanup stale entries every 5 minutes to prevent memory leak
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of limits) {
        if (now - entry.startTime > windowMs) {
            limits.delete(key);
        }
    }
}, CLEANUP_INTERVAL).unref();

export default defineEventHandler((event) => {
    const path = event.node.req.url;

    // Skip rate limiting for internal Nuxt endpoints
    if (path?.startsWith("/api/_nuxt_icon/")) {
        return;
    }

    const clientIP = event.node.req.socket.remoteAddress || "unknown";
    const now = Date.now();

    const key = `${clientIP}:${path}`;
    const current = limits.get(key) || { count: 0, startTime: now };

    if (now - current.startTime > windowMs) {
        current.count = 1;
        current.startTime = now;
    } else {
        current.count++;
    }

    limits.set(key, current);

    if (current.count > maxRequests) {
        throw createError({
            statusCode: 429,
            statusMessage: "Too Many Requests",
        });
    }
});
