/**
 * GET /api/events
 * List events for authenticated user.
 */
import { getUserEvents } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    return getUserEvents(user.id);
});
