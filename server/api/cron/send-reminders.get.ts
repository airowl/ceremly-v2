/**
 * Vercel Cron endpoint (07:00 UTC, crons in nuxt.config.ts → nitro.vercel):
 * processes due reminders (SPEC §6). For each enabled/never-sent reminder
 * of an active event whose rsvpDeadline falls within the daysBefore window:
 * enqueues 'send-reminder-email' for each pending guest, then marks the reminder
 * as sent (idempotency — a duplicate run does not re-send). The cron does no
 * heavy work: it only enqueues.
 *
 * Protection (SPEC §6): `x-vercel-cron` header (reserved to the platform,
 * Vercel strips it from external requests) or `Authorization: Bearer
 * ${CRON_SECRET}` (Vercel sends this ONLY if the project has an env var named
 * exactly CRON_SECRET, without the NUXT_ prefix); fallback for manual trigger:
 * X-Admin-API-Key via requireAdminApiKey.
 */
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { processDueReminders } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    const config = useRuntimeConfig();
    const cronSecret = config.cronSecret as string | undefined;
    const authorization = getHeader(event, "authorization");

    const isVercelCron = Boolean(getHeader(event, "x-vercel-cron"))
        || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`);

    if (!isVercelCron) {
        // Not Vercel Cron: allow only the manual admin trigger.
        await requireAdminApiKey(event);
    }

    try {
        return await processDueReminders();
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[cron.send-reminders] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to process reminders" });
    }
});
