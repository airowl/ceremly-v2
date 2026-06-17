/**
 * Vercel Cron endpoint: hard-delete definitivo degli account la cui grace window
 * è scaduta (diritto all'oblio GDPR). Idempotente — safe su run mancati/duplicati.
 *
 * Auth a 3 vie (come send-reminders): header `x-vercel-cron` (Vercel lo strippa
 * dalle richieste esterne) OPPURE `Authorization: Bearer ${CRON_SECRET}` OPPURE,
 * per il trigger manuale, X-Admin-API-Key.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { purgeDueDeletedAccounts } from "~~/server/services/gdpr.service";
import { logAudit } from "~~/server/utils/audit";

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const cronSecret = config.cronSecret as string | undefined;
    const authorization = getHeader(event, "authorization");

    const isVercelCron = Boolean(getHeader(event, "x-vercel-cron"))
        || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`);

    if (!isVercelCron) {
        await requireAdminApiKey(event);
    }

    try {
        const result = await purgeDueDeletedAccounts();
        if (result.purged > 0 || result.errors.length > 0) {
            await logAudit(event, "user.account_purged", {
                targetType: "system",
                details: { trigger: "cron", ...result },
            });
        }
        return result;
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[cron.purge-deleted-accounts] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to purge deleted accounts" });
    }
});
