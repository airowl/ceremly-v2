/**
 * GET /api/events/:eventId/guests
 * List guests for an event with optional filters.
 * Returns the guest list and summary counts.
 */
import { guestFilterSchema } from "~~/shared/schemas/guest";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { getEventGuests } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const filters = parseQueryParams(event, guestFilterSchema);
    return getEventGuests(event, eventId, filters);
});
