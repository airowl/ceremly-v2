/**
 * POST /api/events/:id/send
 * Accoda l'invio email dell'invito agli ospiti selezionati (RBAC: requireWrite).
 * Salva subject/body in event.distribution. Ritorna { queued, skippedNoEmail }.
 */
import { sendInvitesSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { sendInvites } from "~~/server/services/distribution.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, sendInvitesSchema);

    try {
        return await sendInvites(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Conflitto durante l'invio" });
        }
        console.error("[events.[id].send.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to send invites" });
    }
});
