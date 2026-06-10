/**
 * POST /api/admin/site-mode
 * Imposta l'override runtime del site mode (kill-switch senza redeploy).
 * Body: { mode: "active" | "waitinglist" | "maintenance" }
 * Admin API key authentication.
 *
 * Nota: la propagazione è best-effort entro il TTL della cache per-istanza
 * (~10s), non istantanea/atomica. Il client SPA già caricato vede il valore
 * inlined finché non ricarica; la difesa autorevole è server-side.
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
