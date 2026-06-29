/**
 * POST /api/admin/site-mode
 * Sets the runtime override for site mode (kill-switch without redeploy).
 * Body: { mode: "active" | "waitinglist" | "maintenance" }
 * Admin API key authentication.
 *
 * Note: propagation is best-effort within the per-instance cache TTL (~10s),
 * not instant/atomic. An already-loaded SPA client sees the inlined value
 * until it reloads; the authoritative guard is server-side.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { parseBody } from "~~/server/utils/validateBody";
import { setSiteModeSchema } from "~~/shared/schemas/siteMode";
import { setServerSiteMode } from "~~/server/utils/siteMode";
import { logAudit } from "~~/server/utils/audit";

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);

    const { mode } = await parseBody(event, setSiteModeSchema);

    await setServerSiteMode(mode);

    await logAudit(event, "admin.site_mode_changed", {
        targetType: "system",
        targetId: "site:mode",
        details: { mode, source: "override" },
    });

    return { ok: true, mode };
});
