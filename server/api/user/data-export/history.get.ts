/**
 * GET /api/user/data-export/history
 * Get data export history for the authenticated user
 */
import { paginationQuerySchema } from "~~/shared/schemas/common";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { getExportHistory, type DataExportRecord } from "~~/server/utils/dataExport";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const { limit } = parseQueryParams(event, paginationQuerySchema);

    const history = await getExportHistory(user.id, limit);

    return {
        exports: history.map((exp: DataExportRecord) => ({
            id: exp.id,
            status: exp.expiresAt && new Date(exp.expiresAt) < new Date() && exp.status === "completed"
                ? "expired"
                : exp.status,
            format: exp.format,
            fileSize: exp.fileSize,
            downloadToken: exp.status === "completed" && exp.expiresAt && new Date(exp.expiresAt) >= new Date()
                ? exp.downloadToken
                : null,
            expiresAt: exp.expiresAt,
            completedAt: exp.completedAt,
            errorMessage: exp.errorMessage,
            createdAt: exp.createdAt,
        })),
    };
});
