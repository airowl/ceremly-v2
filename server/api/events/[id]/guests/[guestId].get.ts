/**
 * GET /api/events/:id/guests/:guestId
 * Dettaglio ospite: guest + response completa + attività ordinate desc
 * (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { getGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    const guestId = getRouterParam(event, "guestId");
    if (!id || !guestId) {
        throw createError({ statusCode: 400, statusMessage: "Missing event or guest id" });
    }

    try {
        return await getGuest(event, id, guestId);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].guests.[guestId].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch guest" });
    }
});
