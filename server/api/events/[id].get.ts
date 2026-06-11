/**
 * GET /api/events/:id
 * Evento completo (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { getEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        return await getEvent(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch event" });
    }
});
