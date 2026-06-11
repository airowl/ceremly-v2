/**
 * Vercel Cron endpoint (07:00 UTC, crons in nuxt.config.ts → nitro.vercel):
 * processa i reminder dovuti (SPEC §6). Per ogni reminder enabled/mai inviato
 * di un evento active con rsvpDeadline raggiunta dalla finestra daysBefore:
 * enqueue 'send-reminder-email' per ogni ospite pendente, poi marca il reminder
 * come inviato (idempotenza — un run duplicato non re-invia). Il cron non fa
 * lavoro pesante: accoda soltanto.
 *
 * Protezione (SPEC §6): header `x-vercel-cron` (riservato alla piattaforma,
 * Vercel lo strippa dalle richieste esterne) oppure `Authorization: Bearer
 * ${CRON_SECRET}` (Vercel lo invia SOLO se sul progetto esiste un'env chiamata
 * esattamente CRON_SECRET, senza prefisso NUXT_); fallback per trigger manuale:
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
        // Non è Vercel Cron: consenti solo il trigger manuale admin.
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
