import { createHash, timingSafeEqual } from "node:crypto";
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";

/**
 * Require valid Admin API Key for the request
 * Checks X-Admin-API-Key header against ADMIN_API_KEY env var
 * Throws 401 if missing or invalid
 */
export async function requireAdminApiKey(event: H3Event<EventHandlerRequest>): Promise<void> {
    const config = useRuntimeConfig();
    const adminApiKey = config.adminApiKey as string | undefined;

    if (!adminApiKey) {
        console.error("[Admin API] ADMIN_API_KEY not configured");
        throw createError({
            statusCode: 500,
            statusMessage: "Admin API not configured",
        });
    }

    const providedKey = getHeader(event, "X-Admin-API-Key");

    if (!providedKey) {
        throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized - API Key required",
        });
    }

    // Constant-time comparison to prevent timing attacks
    if (!secureCompare(providedKey, adminApiKey)) {
        throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized - Invalid API Key",
        });
    }
}

/**
 * Confronto constant-time anti-timing. Si confrontano gli HASH SHA-256 (lunghezza
 * fissa) invece delle stringhe grezze: timingSafeEqual richiede buffer di pari
 * lunghezza e così non si rivela la lunghezza della chiave tramite l'early-return.
 */
function secureCompare(a: string, b: string): boolean {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
}
