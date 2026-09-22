import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { forbidden } from "./identity";

/**
 * Coda di lavoro asincrona (plan Task 12, Step 2 → Task 13 per il resto).
 *
 * Strada A vieta il worker persistente: non esiste un processo che "poll-a" la
 * tabella. La coda è quindi **HTTP-first**: chi produce scrive una riga in
 * `jobExecutions` e schedula subito il consumer con `ctx.scheduler.runAfter(0,
 * internal.jobs.run, { jobId })`. Il "worker" è una Convex function, non un
 * processo, e `jobExecutions` è lo stato che rende un tentativo ispezionabile —
 * nel legacy non esisteva alcuna tabella di job.
 *
 * `enqueueJob` è l'unica porta: il chiamante non tocca mai `jobExecutions` né lo
 * scheduler.
 *
 * **Un tipo non registrato è un errore, non un job che nessuno eseguirà.** La
 * registry è chiusa apposta: un `enqueueJob({ type: "email:welcome" })` scritto
 * oggi in attesa del runner di domani creerebbe una riga `pending` che nessuno
 * consuma — cioè un job che *sembra* in coda. Meglio un rifiuto esplicito al
 * momento della scrittura.
 *
 * I tipi sono i sei del piano (Task 13, Step 3): i quattro del legacy QStash
 * (`data-export`, `image-variant`, `send-invite-email`, `send-reminder-email`) più
 * i due nati con la migrazione (`event-cleanup-warning`, `account-purge`). Le email
 * transazionali che nel legacy non passavano dalla coda — verifica, reset, cambio
 * email, invito org, contatto, waiting list — restano azioni schedulate
 * direttamente: dare loro un tipo di job significherebbe un tipo che il piano non
 * prevede, e il valore del retry persistito lì è molto minore (nessun destinatario
 * a valle attende il risultato).
 */

export const JOB_TYPES = {
    /** GDPR: costruisce il JSON e lo scrive su R2. */
    dataExport: "data-export",
    /** Diritto all'oblio: hard-delete dopo la grace window. */
    accountPurge: "account-purge",
    /** Distribuzione inviti: 1 job per ospite (legacy QStash `send-invite-email`). */
    sendInviteEmail: "send-invite-email",
    /** Reminder RSVP: 1 job per ospite (legacy QStash `send-reminder-email`). */
    sendReminderEmail: "send-reminder-email",
    /** Generazione varianti immagine via bridge media (legacy QStash `image-variant`). */
    imageVariant: "image-variant",
    /** Avviso di cleanup di un evento stale, prima della cancellazione. */
    eventCleanupWarning: "event-cleanup-warning",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * Tentativi per tipo: la differenza non è arbitraria, segue la conseguenza del
 * fallimento.
 *
 * - `account-purge` ne ha **uno**: cancellare è irreversibile, e l'errore tipico
 *   (R2 irraggiungibile) non migliora con un retry a raffica. Il purge è già
 *   ripreso dallo sweep giornaliero, che è il posto giusto per riprovare.
 * - `data-export` e `image-variant` restano a 3: un export pesante che fallisce
 *   tre volte è un guasto da guardare, non da ritentare all'infinito.
 * - le email arrivano a 5: un 429 o un 500 di provider è transitorio per
 *   definizione, e il costo di un tentativo in più è una riga di log.
 */
export const JOB_MAX_ATTEMPTS: Record<JobType, number> = {
    [JOB_TYPES.dataExport]: 3,
    [JOB_TYPES.accountPurge]: 1,
    [JOB_TYPES.sendInviteEmail]: 5,
    [JOB_TYPES.sendReminderEmail]: 5,
    [JOB_TYPES.imageVariant]: 3,
    [JOB_TYPES.eventCleanupWarning]: 5,
};

const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 86_400_000;

/**
 * Backoff esponenziale (plan Task 13, Step 1): `min(60_000 * 2 ** attempts, 24h)`,
 * dove `attempts` è il numero di tentativi **già consumati**.
 *
 * Deterministico e senza jitter, ed è una scelta: con un solo esecutore non c'è
 * una folla da sparpagliare, e un ritardo prevedibile è ciò che rende il test
 * verificabile senza fissare un orologio. Il tetto a 24h esiste perché oltre un
 * giorno il retry non è più un retry — è `dead` che finge di essere vivo.
 */
export function retryDelayMs(attempts: number): number {
    const exponent = Math.max(1, Math.floor(attempts));
    return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

const isJobType = (value: string): value is JobType =>
    (Object.values(JOB_TYPES) as string[]).includes(value);

export interface EnqueueJobInput {
    type: string;
    payload?: Record<string, unknown>;
    /**
     * Chiave di dedup del produttore (es. `data-export:<appUserId>`).
     *
     * Se un job con la stessa `(name, dedupeKey)` è ancora vivo — `pending`,
     * `retrying` o `running` — quello viene restituito e non se ne crea un secondo:
     * è l'idempotenza che il plan chiede sulle richieste ripetute (l'utente che
     * clicca due volte "esporta i miei dati" non deve generare due raccolte).
     *
     * `retrying` conta come vivo: un job in attesa del prossimo tentativo sta
     * ancora lavorando, e accodarne un secondo duplicherebbe l'effetto del primo.
     * Un job `dead` invece non blocca: la chiave descriveva *quella* richiesta, e
     * l'operatore che la ripete vuole un tentativo nuovo.
     */
    dedupeKey?: string;
    /** Ritardo del primo tentativo; `0` per "appena possibile". */
    delayMs?: number;
}

export interface EnqueueJobResult {
    jobId: Id<"jobExecutions">;
    /** True quando un job già in coda è stato riusato invece di crearne uno. */
    deduplicated: boolean;
}

/** Stati in cui un job è ancora "in volo" ai fini della chiave di dedup. */
export const LIVE_JOB_STATUSES = ["pending", "retrying", "running"] as const;

export async function enqueueJob(
    ctx: MutationCtx,
    input: EnqueueJobInput,
): Promise<EnqueueJobResult> {
    if (!isJobType(input.type)) {
        throw forbidden("JOB_TYPE_UNKNOWN", { type: input.type, known: Object.values(JOB_TYPES) });
    }
    const type: JobType = input.type;

    if (input.dedupeKey) {
        const existing = await ctx.db
            .query("jobExecutions")
            .withIndex("by_name_dedupe", (q) =>
                q.eq("name", type).eq("dedupeKey", input.dedupeKey),
            )
            .collect();

        const live = existing.find((job) =>
            (LIVE_JOB_STATUSES as readonly string[]).includes(job.status),
        );
        if (live) {
            return { jobId: live._id, deduplicated: true };
        }
    }

    const now = Date.now();
    const delayMs = Math.max(0, input.delayMs ?? 0);

    const jobId = await ctx.db.insert("jobExecutions", {
        name: type,
        status: "pending",
        attempt: 0,
        maxAttempts: JOB_MAX_ATTEMPTS[type],
        // `nextAttemptAt` è nell'indice con `status`: il primo tentativo è dovuto
        // quando lo scheduler scatta, e lo sweep dei job orfani usa lo stesso campo
        // per riprendere ciò che lo scheduler ha perso.
        nextAttemptAt: now + delayMs,
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
        createdAt: now,
        updatedAt: now,
    });

    await ctx.scheduler.runAfter(delayMs, internal.jobs.run, { jobId });

    return { jobId, deduplicated: false };
}
