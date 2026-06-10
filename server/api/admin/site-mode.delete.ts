/**
 * DELETE /api/admin/site-mode
 * Rimuove l'override runtime: il server torna a seguire NUXT_PUBLIC_SITE_MODE.
 * Admin API key authentication.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { clearServerSiteModeOverride } from "~~/server/utils/siteMode";
import { logAudit } from "~~/server/utils/audit";

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);

    await clearServerSiteModeOverride();

    await logAudit(event, "admin.site_mode_changed", {
        targetType: "system",
        targetId: "site:mode",
        details: { mode: null, source: "cleared" },
    });

    return { ok: true, mode: null };
});
