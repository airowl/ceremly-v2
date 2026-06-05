/**
 * GET /api/events/:eventId
 * Get event detail with guest status counts.
 */
import { getEventById } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    return getEventById(event, eventId);
});
