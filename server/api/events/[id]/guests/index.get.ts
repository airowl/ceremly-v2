/**
 * GET /api/events/:id/guests
 * Tutti gli ospiti (anche removed) con stato derivato + summary
 * (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { listGuests } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        return await listGuests(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].guests.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list guests" });
    }
});
