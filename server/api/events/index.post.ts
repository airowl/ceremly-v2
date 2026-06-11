/**
 * POST /api/events
 * Crea un evento da template nell'org attiva (RBAC: requireWrite).
 * 404 template inesistente/mismatch, 402 limite piano Free.
 */
import { createEventSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { createEvent } from "~~/server/services/event.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const data = await parseBody(event, createEventSchema);

    try {
        return await createEvent(event, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Evento già esistente" });
        }
        console.error("[events.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create event" });
    }
});
