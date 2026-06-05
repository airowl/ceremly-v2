/**
 * GET /api/events/:eventId/reminders/stats
 * Get reminder statistics for an event.
 */
import { getReminderStats } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;

    return getReminderStats(event, eventId);
});
