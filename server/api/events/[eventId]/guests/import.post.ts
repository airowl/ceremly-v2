/**
 * POST /api/events/:eventId/guests/import
 * Bulk import guests from parsed CSV data.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { importGuestsSchema } from "~~/shared/schemas/guest";
import { importGuests } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const input = await parseBody(event, importGuestsSchema);

    return importGuests(event, eventId, user.id, input);
});
