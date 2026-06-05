/**
 * PUT /api/events/:eventId/registration
 * Create or update the registration page data for an event.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { saveLandingSchema } from "~~/shared/schemas/landing";
import { saveRegistrationSettings } from "~~/server/services/landing.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const input = await parseBody(event, saveLandingSchema);

    return saveRegistrationSettings(event, eventId, input);
});
