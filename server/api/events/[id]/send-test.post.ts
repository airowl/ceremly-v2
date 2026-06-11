/**
 * POST /api/events/:id/send-test
 * Invia subito l'email d'invito di prova all'utente corrente, con ospite
 * d'esempio "Anna" (RBAC: requireWrite). Body opzionale: override subject/body.
 */
import { sendTestSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { sendTest } from "~~/server/services/distribution.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const override = await parseBody(event, sendTestSchema);

    try {
        return await sendTest(event, id, override);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Conflitto durante l'invio del test" });
        }
        console.error("[events.[id].send-test.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to send test email" });
    }
});
