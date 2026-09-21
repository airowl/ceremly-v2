/**
 * POST /api/public/invite/:token/rsvp
 * Submission RSVP ospite (SPEC §6) — NESSUNA auth: lookup SOLO by token (§8.2).
 *
 * Con `NUXT_PUBLIC_FORMS_BACKEND=convex` è trasporto: il token viaggia nel payload
 * firmato insieme al digest dell'IP, e validazione, finestra di chiusura, rate limit
 * per IP e upsert vivono in Convex. 404/410/422 restano quelli del dominio, perché
 * lo status e il messaggio del rifiuto tornano indietro dal bridge.
 */
import { publicRsvpSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { submitRsvp } from "~~/server/services/publicInvite.service";
import { isEndpointRateLimited } from "~~/server/utils/spamProtection";
import { getClientIp } from "~~/server/utils/clientIp";
import {
    PUBLIC_FORM_PATHS,
    forwardPublicForm,
    isConvexFormsBackend,
} from "~~/server/utils/publicFormsBridge";

export default defineEventHandler(async (event) => {
    const token = getRouterParam(event, "token");
    if (!token) {
        throw createError({ statusCode: 404, statusMessage: "Invito non disponibile" });
    }

    if (isConvexFormsBackend()) {
        const body = await readBody(event);
        return await forwardPublicForm(event, PUBLIC_FORM_PATHS.rsvp, {
            ...(body && typeof body === "object" ? body : {}),
            token,
        });
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
