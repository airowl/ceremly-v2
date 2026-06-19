/**
 * Vercel Cron (04:00 UTC): cleanup eventi conclusi+inattivi (SPEC §9). Fase WARN
 * (email + cleanupWarnedAt) poi DELETE (warned ≥7gg → delete cascade). Org Atelier
 * escluse. Auth 3-way come send-reminders.
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
