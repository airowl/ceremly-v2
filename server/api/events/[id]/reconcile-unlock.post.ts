/**
 * POST /api/events/:id/reconcile-unlock
 * Reconciles the Celebration unlock after returning from the Creem checkout.
 * Used by the client when ?unlocked=true is present in the URL (fire-and-forget
 * webhook delivery may have missed the unlock).
 *
 * Thin route: auth + RBAC write, then delegates to the service. Returns { reconciled }.
 */
import { requireWrite } from "~~/server/utils/permissions";
import { reconcileEventUnlock } from "~~/server/services/eventReconcile.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const org = await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    try {
        return await reconcileEventUnlock(id, org.id);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].reconcile-unlock.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to reconcile unlock" });
    }
});
