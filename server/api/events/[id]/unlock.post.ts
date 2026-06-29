/**
 * POST /api/events/:id/unlock
 * Issues a Creem one-time checkout (Celebration) to unlock the event.
 * Thin route: auth + RBAC write, then delegates to the service. Returns { url } for the
 * client redirect. No body (id from path).
 */
import { requireWrite } from "~~/server/utils/permissions";
import { createCelebrationCheckout } from "~~/server/services/checkout.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    try {
        return await createCelebrationCheckout(event, id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].unlock.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create checkout" });
    }
});
