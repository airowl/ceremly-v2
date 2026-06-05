/**
 * POST /api/events
 * Create a new event.
 */
import { createEventSchema } from "~~/shared/schemas/event";
import { parseBody } from "~~/server/utils/validateBody";
import { createEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const body = await parseBody(event, createEventSchema);
    return createEvent(event, user.id, body);
});
