/**
 * POST /api/events/:id/guests/import
 * Import bulk (righe JSON già parsate dal client): valida, importa fino al
 * limite del piano, segnala skipped/warnings (RBAC: requireWrite).
 */
import { importGuestsSchema } from "~~/shared/schemas/ceremly";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { importGuests } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }
    const data = await parseBody(event, importGuestsSchema);

    try {
        return await importGuests(event, id, data);
    } catch (e) {
        const err = e as { statusCode?: number, code?: string };
        if (err.statusCode) throw e;
        if (err.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Conflitto durante l'import" });
        }
        console.error("[events.[id].guests.import.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to import guests" });
    }
});
