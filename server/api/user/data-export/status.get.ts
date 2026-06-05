/**
 * GET /api/user/data-export/status
 * Get the latest data export status for the current user.
 */
import { getDataExportStatus } from "~~/server/services/user.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);

    return getDataExportStatus(user.id);
});
