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
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}
