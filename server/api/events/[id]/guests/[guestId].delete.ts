/**
 * DELETE /api/events/:id/guests/:guestId
 * Soft-delete: sets removedAt — link inactive, response preserved
 * (RBAC: requireWrite + assertOwnership in the service).
 */
import { requireWrite } from "~~/server/utils/permissions";
import { softDeleteGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    const guestId = getRouterParam(event, "guestId");
    if (!id || !guestId) {
        throw createError({ statusCode: 400, statusMessage: "Missing event or guest id" });
    }

    try {
        return await softDeleteGuest(event, id, guestId);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].guests.[guestId].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to remove guest" });
    }
});
