/**
 * GET /api/events/:id/guests/:guestId/qr
 * PNG QR del link personale `{baseURL}/e/{slug}/{token}` (width 600, margin 2).
 * RBAC: requireMember + assertOwnership nel service. Cache privata: il QR
 * incorpora il token dell'ospite.
 */
import { requireMember } from "~~/server/utils/permissions";
import { getGuestQrPng } from "~~/server/services/guest.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    const guestId = getRouterParam(event, "guestId");
    if (!id || !guestId) {
        throw createError({ statusCode: 400, statusMessage: "Missing event or guest id" });
    }

    try {
        const { png, filename } = await getGuestQrPng(event, id, guestId);
        setHeader(event, "Content-Type", "image/png");
        setHeader(event, "Content-Disposition", `inline; filename="${filename}"`);
        setHeader(event, "Cache-Control", "private, max-age=0");
        return png;
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[events.[id].guests.[guestId].qr.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to generate QR code" });
    }
});
