/**
 * GET /api/admin/site-mode
 * Stato corrente del site mode: effettivo, override runtime, default d'ambiente.
 * Admin API key authentication.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getSiteModeStatus } from "~~/server/utils/siteMode";

export default defineEventHandler(async (event) => {
    await requireAdminApiKey(event);
    return await getSiteModeStatus();
});
