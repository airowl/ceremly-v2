/**
 * GET /api/events/:eventId/landing
 * Retrieve the landing page data for an event.
 * Returns default RSVP landing data if no record exists yet.
 */
import { getLandingData } from "~~/server/services/landing.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId");

    return getLandingData(event, eventId!);
});
