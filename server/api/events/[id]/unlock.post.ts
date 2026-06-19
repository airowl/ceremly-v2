/**
 * POST /api/events/:id/unlock
 * Emette un checkout Creem one-time (Celebrazione) per sbloccare l'evento.
 * Route thin: auth + RBAC write, poi delega al service. Ritorna { url } per il
 * redirect client. Nessun body (id dal path).
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
