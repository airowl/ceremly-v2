/**
 * POST /api/organizations
 * Creates an organization (plan-limit gate + plugin). RBAC: authenticated user.
 */
import { createOrganizationSchema } from "~~/shared/schemas/organization";
import { parseBody } from "~~/server/utils/validateBody";
import { createOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const data = await parseBody(event, createOrganizationSchema);

    try {
        return await createOrganization(event, user.id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        if (e.code === "23505" || e.body?.code === "ORGANIZATION_ALREADY_EXISTS") {
            throw createError({ statusCode: 409, statusMessage: "Organization slug already exists" });
        }
        console.error("[organizations.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create organization" });
    }
});
