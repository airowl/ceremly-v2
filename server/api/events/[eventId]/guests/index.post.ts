/**
 * POST /api/events/:eventId/guests
 * Add a single guest manually.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { createGuestSchema } from "~~/shared/schemas/guest";
import { addGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const input = await parseBody(event, createGuestSchema);

    return addGuest(event, eventId, user.id, input);
});
