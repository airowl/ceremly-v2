/**
 * GET /api/templates
 * List event templates (system + user's own), optionally filtered by category.
 */
import { listTemplates } from "~~/server/services/eventTemplate.service";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { listTemplatesQuerySchema } from "~~/shared/schemas/eventTemplate";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const filters = parseQueryParams(event, listTemplatesQuerySchema);

    return listTemplates(user.id, filters);
});
