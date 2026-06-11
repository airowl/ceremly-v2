/**
 * GET /api/public/invite/:token
 * Invito pubblico ospite (SPEC §6.2) — NESSUNA auth: lookup SOLO by token (§8.2).
 * 404 generico e indistinguibile (token inesistente / ospite rimosso / evento draft).
 * Side-effect tracking (firstOpenedAt, openCount, activity) nel service.
 */
import { getPublicInvite } from "~~/server/services/publicInvite.service";

export default defineEventHandler(async (event) => {
    const token = getRouterParam(event, "token");
    if (!token) {
        throw createError({ statusCode: 404, statusMessage: "Invito non disponibile" });
    }

    try {
        return await getPublicInvite(token);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[public.invite.[token].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch invite" });
    }
});
