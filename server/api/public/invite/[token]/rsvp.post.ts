/**
 * POST /api/public/invite/:token/rsvp
 * Guest RSVP submission (SPEC §6) — NO auth: lookup by token ONLY (§8.2).
 * Generic 404, 410 (rsvpClosedMessage) when deadline has passed, 422 with errors from
 * authoritative validation §3.4. Upsert: the response is always the latest version.
 */
import { publicRsvpSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { submitRsvp } from "~~/server/services/publicInvite.service";
import { isEndpointRateLimited } from "~~/server/utils/spamProtection";
import { getClientIp } from "~~/server/utils/clientIp";

export default defineEventHandler(async (event) => {
    const token = getRouterParam(event, "token");
    if (!token) {
        throw createError({ statusCode: 404, statusMessage: "Invito non disponibile" });
    }

    // Per-IP rate limit (Redis): defense against forged/flooded RSVPs on the
    // unauthenticated public endpoint. Generous limit (30/min) to avoid blocking
    // multiple guests behind the same IP (NAT/CGNAT/event WiFi); lethal for scripts.
    if (await isEndpointRateLimited(getClientIp(event), "public-rsvp", 30, 60 * 1000)) {
        throw createError({ statusCode: 429, statusMessage: "Troppe richieste. Riprova tra poco." });
    }

    const data = await parseBody(event, publicRsvpSchema);

    try {
        return await submitRsvp(token, data);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[public.invite.[token].rsvp.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to submit RSVP" });
    }
});
