/**
 * Vercel Cron endpoint: permanent hard-delete of accounts whose grace window
 * has expired (GDPR right to erasure). Idempotent — safe on missed/duplicate runs.
 *
 * 3-way auth (like send-reminders): `x-vercel-cron` header (Vercel strips it
 * from external requests) OR `Authorization: Bearer ${CRON_SECRET}` OR,
 * for manual triggers, X-Admin-API-Key.
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
