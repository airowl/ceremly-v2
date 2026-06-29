/**
 * GET /api/events/:id/export
 * Guest CSV (UTF-8 BOM, RFC 4180, dynamic columns from rsvpConfig).
 * RBAC: requireMember + assertOwnership in the service.
 */
import { requireMember } from "~~/server/utils/permissions";
import { exportGuestsCsv } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing event id" });
    }

    try {
        const { csv, filename } = await exportGuestsCsv(event, id);
        setHeader(event, "Content-Type", "text/csv; charset=utf-8");
        setHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
        setHeader(event, "Cache-Control", "private, no-store");
        return csv;
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].export.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to export guests" });
    }
});
