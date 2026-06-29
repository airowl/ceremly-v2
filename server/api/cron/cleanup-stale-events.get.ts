/**
 * Vercel Cron (04:00 UTC): cleanup of concluded+inactive events (SPEC §9). WARN phase
 * (email + cleanupWarnedAt) then DELETE (warned ≥7 days → delete cascade). Atelier orgs
 * excluded. 3-way auth like send-reminders.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { processStaleEventsWarn, processStaleEventsDelete } from "~~/server/services/eventCleanup.service";

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
        const warn = await processStaleEventsWarn();
        const del = await processStaleEventsDelete();
        return { warn, delete: del };
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[cron.cleanup-stale-events] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to cleanup stale events" });
    }
});
