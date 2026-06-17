/**
 * POST /api/public/invite/:token/rsvp
 * Submission RSVP ospite (SPEC §6) — NESSUNA auth: lookup SOLO by token (§8.2).
 * 404 generico, 410 (rsvpClosedMessage) a deadline passata, 422 con errors dalla
 * validazione autoritativa §3.4. Upsert: la risposta è sempre l'ultima versione.
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

    // Rate limit per-IP (Redis): difesa contro RSVP forgiati/flood sull'endpoint
    // pubblico non autenticato. Limite generoso (30/min) per non bloccare più
    // ospiti dietro lo stesso IP (NAT/CGNAT/WiFi evento); letale per gli script.
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
