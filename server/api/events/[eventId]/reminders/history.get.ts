/**
 * GET /api/events/:eventId/reminders/history
 * Reminder history for all guests of an event, ordered by sentAt desc.
 * Includes guest name and template name.
 */
import { getReminderHistory } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId");

    return getReminderHistory(event, eventId!);
});
