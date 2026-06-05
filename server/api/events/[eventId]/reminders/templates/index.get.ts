/**
 * GET /api/events/:eventId/reminders/templates
 * List reminder templates for an event.
 * If no templates exist, auto-creates default templates first.
 */
import { getOrCreateTemplates } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId");

    return getOrCreateTemplates(event, eventId!);
});
