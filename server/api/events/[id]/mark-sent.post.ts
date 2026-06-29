/**
 * POST /api/events/:id/mark-sent
 * Marks selected guests as sent via WhatsApp — used by the "Copia" button
 * on the distribution page (RBAC: requireWrite). Returns { marked }.
 */
import { markSentSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { markWhatsappSent } from "~~/server/services/distribution.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, markSentSchema);

    try {
        return await markWhatsappSent(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Conflitto durante l'aggiornamento" });
        }
        console.error("[events.[id].mark-sent.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to mark guests as sent" });
    }
});
