/**
 * DELETE /api/events/:id
 * Hard delete con cascade (RBAC: requireWrite + assertOwnership nel service).
 */
import { requireWrite } from "~~/server/utils/permissions";
import { deleteEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        return await deleteEvent(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to delete event" });
    }
});
