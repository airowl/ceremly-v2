/**
 * PUT /api/events/:eventId
 * Update event fields. Only the owner can update.
 */
import { updateEventSchema } from "~~/shared/schemas/event";
import { parseBody } from "~~/server/utils/validateBody";
import { updateEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const body = await parseBody(event, updateEventSchema);
    return updateEvent(event, eventId, body);
});
