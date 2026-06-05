/**
 * PUT /api/events/:eventId/landing
 * Create or update the landing page data for an event.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { saveLandingSchema } from "~~/shared/schemas/landing";
import { saveLandingData } from "~~/server/services/landing.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const input = await parseBody(event, saveLandingSchema);

    return saveLandingData(event, eventId, input);
});
