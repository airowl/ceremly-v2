/**
 * PUT /api/events/:id/guests/:guestId
 * Update guest — token IMMUTABLE, email clearable (RBAC: requireWrite).
 */
import { updateGuestSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { updateGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    const guestId = getRouterParam(event, "guestId");
    if (!id || !guestId) {
        throw createError({ statusCode: 400, statusMessage: "Missing event or guest id" });
    }
    const data = await parseBody(event, updateGuestSchema);

    try {
        return await updateGuest(event, id, guestId, data);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].guests.[guestId].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update guest" });
    }
});
