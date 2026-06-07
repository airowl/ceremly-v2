/**
 * PUT /api/organizations/:id
 * Update org (path-id). Authz role-based del caller delegata al plugin.
 */
import { updateOrganizationSchema } from "~~/shared/schemas/organization";
import { parseBody } from "~~/server/utils/validateBody";
import { updateOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }
    const data = await parseBody(event, updateOrganizationSchema);

    try {
        return await updateOrganization(event, user.id, id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update organization" });
    }
});
