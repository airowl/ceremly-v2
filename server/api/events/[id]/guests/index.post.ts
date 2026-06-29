/**
 * POST /api/events/:id/guests
 * Creates a guest with a personal token (RBAC: requireWrite).
 * 402 if the Free plan has reached the 30-guest limit.
 */
import { createGuestSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { createGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, createGuestSchema);

    try {
        return await createGuest(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Ospite già esistente" });
        }
        console.error("[events.[id].guests.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create guest" });
    }
});
