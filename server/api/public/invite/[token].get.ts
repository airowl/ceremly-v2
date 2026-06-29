/**
 * GET /api/public/invite/:token
 * Public guest invite (SPEC §6.2) — NO auth: lookup by token ONLY (§8.2).
 * Generic and indistinguishable 404 (non-existent token / removed guest / draft event).
 * Side-effect tracking (firstOpenedAt, openCount, activity) in the service.
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
