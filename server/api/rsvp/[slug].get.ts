/**
 * GET /api/rsvp/:slug?guest=guestId
 * Public endpoint - NO auth required.
 * Returns event data and RSVP landing page.
 * Optionally includes guest data when ?guest= is provided.
 */
import { z } from "zod";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { getPublicRsvpData } from "~~/server/services/publicEvent.service";

const rsvpQuerySchema = z.object({
    guest: z.string().optional(),
});

export default defineEventHandler(async (event) => {
    const slug = getRouterParam(event, "slug");
    if (!slug) {
        throw createError({ statusCode: 400, statusMessage: "Missing event slug" });
    }
    const { guest } = parseQueryParams(event, rsvpQuerySchema);
    return getPublicRsvpData(slug, guest);
});
