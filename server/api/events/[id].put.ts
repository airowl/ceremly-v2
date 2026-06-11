/**
 * PUT /api/events/:id
 * Update parziale; invarianti blocks/rsvpConfig → 422 (RBAC: requireWrite).
 */
import { updateEventSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { updateEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, updateEventSchema);

    try {
        return await updateEvent(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update event" });
    }
});
