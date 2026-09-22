import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron del backend Convex (plan Task 13, Step 4) — dichiarativi.
 *
 * Questo file **dichiara** soltanto. Le implementazioni sono mutation/action in
 * `convex/jobs.ts`, perché la regola di Strada A vale anche qui: un cron che fa
 * lavoro pesante è un cron che fallisce sul caso che conta. Ogni voce seleziona un
 * lotto limitato (indicizzato dove serve) e **accoda** un job, oppure processa un
 * batch piccolo; nessuna esegue un ciclo illimitato.
 *
 * Sostituisce i Vercel Cron del legacy (`nuxt.config.ts` → `vercel.config.crons`),
 * che erano quattro endpoint HTTP con auth a tre vie (`x-vercel-cron`, Bearer,
 * admin key). Qui la piattaforma è quella che invoca: non c'è un endpoint da
 * proteggere, quindi non c'è una chiave da far girare.
 *
 * Gli orari sono UTC e ricalcano quelli del legacy dove esistevano:
 * - reminder: 07:00 (l'ora in cui la finestra `daysBefore` scatta per più eventi)
 * - cleanup file: 03:00 (nessun utente attivo, R2 meno contendibile)
 * - eventi stale: 04:00
 * - purge account: 05:00 (dopo il cleanup file: gli oggetti del purge sono già lì)
 */

const crons = cronJobs();

/** Reminder RSVP dovuti (SPEC §6): il cron accoda un job per ospite pendente. */
crons.daily(
    "send-due-reminders",
    { hourUTC: 7, minuteUTC: 0 },
    internal.jobs.cronSendDueReminders,
    {},
);

/** Upload mai confermati oltre la grace period: oggetto R2 + riga. */
crons.daily(
    "cleanup-orphan-files",
    { hourUTC: 3, minuteUTC: 0 },
    internal.jobs.cronCleanupOrphanFiles,
    {},
);

/** Eventi conclusi e inattivi: avviso a 7 giorni, cancellazione dopo. */
crons.daily(
    "cleanup-stale-events",
    { hourUTC: 4, minuteUTC: 0 },
    internal.jobs.cronCleanupStaleEvents,
    {},
);

/** Diritto all'oblio: hard-delete dopo la grace window (GDPR). */
crons.daily(
    "purge-deleted-accounts",
    { hourUTC: 5, minuteUTC: 0 },
    internal.jobs.enqueueDuePurges,
    {},
);

/**
 * Recupero degli upload immagine le cui varianti non sono mai state generate.
 *
 * Ogni ora e non una volta al giorno: qui il ritardo è visibile all'utente (una
 * foto senza miniatura), mentre i job sopra producono effetti che nessuno guarda
 * in tempo reale.
 */
crons.hourly(
    "requeue-image-variants",
    { minuteUTC: 30 },
    internal.jobs.cronRequeueImageVariants,
    {},
);

/**
 * Ripresa dei job persi o interrotti (retry persistito).
 *
 * Ogni ora, e non a ogni minuto, perché `nextAttemptAt` esiste apposta: il retry
 * normale è già consegnato dallo scheduler, e questo sweep copre solo le consegne
 * perse e le esecuzioni morte a metà — eventi rari per definizione.
 */
crons.hourly(
    "recover-stalled-jobs",
    { minuteUTC: 0 },
    internal.jobs.cronRecoverStalledJobs,
    {},
);

export default crons;
