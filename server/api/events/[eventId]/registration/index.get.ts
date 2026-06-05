/**
 * GET /api/events/:eventId/registration
 * Retrieve the registration page data for an event.
 * Returns default registration landing data if no record exists yet.
 */
import { getRegistrationData } from "~~/server/services/landing.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId");

    return getRegistrationData(event, eventId!);
});
