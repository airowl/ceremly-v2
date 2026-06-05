/**
 * DELETE /api/events/:eventId
 * Delete event and all related data (cascades via FK).
 */
import { deleteEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    return deleteEvent(event, eventId);
});
