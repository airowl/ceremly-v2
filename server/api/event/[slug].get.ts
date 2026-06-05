/**
 * GET /api/event/:slug
 * Public endpoint - NO auth required.
 * Returns public event data and registration page for a given slug.
 */
import { getPublicEvent } from "~~/server/services/publicEvent.service";

export default defineEventHandler(async (event) => {
    const slug = getRouterParam(event, "slug");

    if (!slug) {
        throw createError({
            statusCode: 400,
            statusMessage: "Missing event slug",
        });
    }

    return getPublicEvent(slug);
});
