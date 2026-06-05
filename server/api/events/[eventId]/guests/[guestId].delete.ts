/**
 * DELETE /api/events/:eventId/guests/:guestId
 * Remove a guest from an event.
 */
import { deleteGuest } from "~~/server/services/guest.service";

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

    return deleteGuest(event, eventId, guestId);
});
