/**
 * GET /api/organizations
 * Lists the organizations the user is a member of.
 */
import { listOrganizations } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);

    try {
        return await listOrganizations(user.id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list organizations" });
    }
});
