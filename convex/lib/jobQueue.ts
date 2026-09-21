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
 * nel legacy non esisteva alcuna tabella di job, il polling worker non è
 * compatibile con questa architettura.
 *
 * `enqueueJob` è l'unica porta: il chiamante non tocca mai `jobExecutions` né lo
 * scheduler. La firma resta invariata quando il Task 13 aggiunge email, media,
 * retry generalizzato e cron — quello che cambia è il contenuto di `JOB_TYPES` e
 * il dispatch in `convex/jobs.ts`.
 *
 * **Un tipo non registrato è un errore, non un job che nessuno eseguirà.** La
 * registry è chiusa apposta: un `enqueueJob({ type: "email:welcome" })` scritto
 * oggi in attesa del runner di domani creerebbe una riga `pending` che nessuno
 * consuma — cioè un job che *sembra* in coda. Meglio un rifiuto esplicito al
 * momento della scrittura.
 */

export const JOB_TYPES = {
    /** GDPR: costruisce il JSON e lo scrive su R2. */
    dataExport: "data-export",
    /** Diritto all'oblio: hard-delete dopo la grace window. */
    accountPurge: "account-purge",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/** Tentativi per tipo: un export che fallisce si può ritentare, un purge no. */
export const JOB_MAX_ATTEMPTS: Record<JobType, number> = {
    [JOB_TYPES.dataExport]: 3,
    [JOB_TYPES.accountPurge]: 1,
};

const isJobType = (value: string): value is JobType =>
    (Object.values(JOB_TYPES) as string[]).includes(value);

export interface EnqueueJobInput {
    type: string;
    payload?: Record<string, unknown>;
    /**
     * Chiave di dedup del produttore (es. `data-export:<appUserId>`).
     *
     * Se un job con la stessa `(name, dedupeKey)` è ancora `pending` o `running`,
     * quello viene restituito e non se ne crea un secondo: è l'idempotenza che il
     * plan chiede sulle richieste ripetute (l'utente che clicca due volte
     * "esporta i miei dati" non deve generare due raccolte).
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

        const live = existing.find(
            (job) => job.status === "pending" || job.status === "running",
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
        // quando lo scheduler scatta, e la scansione del Task 13 usa lo stesso
        // campo per i retry.
        nextAttemptAt: now + delayMs,
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
        createdAt: now,
        updatedAt: now,
    });

    await ctx.scheduler.runAfter(delayMs, internal.jobs.run, { jobId });

    return { jobId, deduplicated: false };
}
