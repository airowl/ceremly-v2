/**
 * GET /api/events/:id/stats
 * Event statistics §6.1 (RBAC: requireMember + assertOwnership in the service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { getEventStats } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        return await getEventStats(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].stats.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch event stats" });
    }
});
