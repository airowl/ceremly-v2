/**
 * POST /api/events/:id/reconcile-unlock
 * Riconcilia l'unlock Celebrazione dopo il ritorno dal checkout Creem.
 * Usato dal client quando ?unlocked=true è presente nella URL (fire-and-forget
 * del webhook potrebbe aver perso l'unlock).
 *
 * Route thin: auth + RBAC write, poi delega al service. Ritorna { reconciled }.
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
