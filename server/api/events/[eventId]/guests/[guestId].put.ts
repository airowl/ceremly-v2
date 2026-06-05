/**
 * PUT /api/events/:eventId/guests/:guestId
 * Update a guest's details.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { updateGuestSchema } from "~~/shared/schemas/guest";
import { updateGuest } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const guestId = getRouterParam(event, "guestId");

    if (!guestId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Missing guestId",
        });
    }

    const input = await parseBody(event, updateGuestSchema);

    return updateGuest(event, eventId, guestId, input);
});
