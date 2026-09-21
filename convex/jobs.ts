import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { BRIDGE_PATH, callBridge, errorMessage, tryBridge } from "./lib/storageBridge";
import { JOB_TYPES, enqueueJob } from "./lib/jobQueue";

/**
 * Esecutore dei job (plan Task 12, Step 2; il Task 13 generalizza retry e cron).
 *
 * Il "worker" è questa function: nessun processo, nessun polling. `enqueueJob`
 * scrive la riga e schedula `run`, che è l'unico consumatore. Lo stato vive in
 * `jobExecutions` — `pending → running → succeeded | failed → (retry) | dead` —
 * quindi un tentativo è ispezionabile invece di essere una riga di log.
 *
 * Qui vivono i due job del Task 12 (`data-export`, `account-purge`). Il Task 13
 * aggiunge email/media e il retry generalizzato **senza cambiare la firma di
 * `enqueueJob`**: cambia il dispatch in questo file.
 */

/** Backoff dei retry: lineare e corto, il Task 13 lo rende esponenziale. */
const RETRY_DELAY_MS = 30_000;

/**
 * Diritto esclusivo di esecuzione di un job `running`.
 *
 * Non è una precauzione teorica: la consegna di un job non è garantita una
 * volta sola. Lo scheduler può consegnare lo stesso `jobId` mentre il primo
 * tentativo è ancora in volo (misurato: due `markRunning` sullo stesso job,
 * `attempt: 2`, e due scritture su R2 per un export), e un cron manuale che
 * riprende i job bloccati fa lo stesso. Con il lease la seconda consegna è un
 * no-op; quando il lease scade (processo morto a metà, action terminata dal
 * runtime) il job torna riprendibile, quindi nessun job resta bloccato `running`
 * per sempre.
 */
const RUN_LEASE_MS = 10 * 60 * 1000;

export const getJob = internalQuery({
    args: { jobId: v.id("jobExecutions") },
    handler: async (ctx, args): Promise<Doc<"jobExecutions"> | null> => await ctx.db.get(args.jobId),
});

/**
 * Il passo che nel legacy era un worker in polling e che qui è il cron: guarda se
 * esistono account con la grace window scaduta e, **solo** in quel caso, accoda il
 * job di purge. Non fa il lavoro: un account con molti eventi e oggetti non entra
 * nella finestra di un cron, quindi lo sweep accoda e il job processa un lotto.
 *
 * Nessuna `dedupeKey`, ed è una scelta: due sweep in coda sono innocui (la
 * scansione è idempotente — un account già cancellato non è più nell'indice
 * `by_purge_at`), mentre una chiave di dedup farebbe **perdere** uno sweep ogni
 * volta che il precedente resta `pending` per un guasto, cioè esattamente quando
 * il purge serve.
 */
export const enqueueDuePurges = internalMutation({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ enqueued: boolean; due: number }> => {
        const due: Array<{ appUserId: Id<"appUsers">; authUserId: string }> = await ctx.runQuery(
            internal.profile.dueAccounts,
            { limit: args.limit },
        );
        if (due.length === 0) return { enqueued: false, due: 0 };

        await enqueueJob(ctx, {
            type: JOB_TYPES.accountPurge,
            payload: { limit: args.limit ?? due.length },
        });

        return { enqueued: true, due: due.length };
    },
});

export const markRunning = internalMutation({
    args: { jobId: v.id("jobExecutions") },
    handler: async (ctx, args): Promise<{ name: string; payload: Record<string, unknown> } | null> => {
        const job = await ctx.db.get(args.jobId);
        if (!job) return null;

        // Un job già concluso non si riesegue: la scheduler non ri-consegna, ma un
        // retry manuale non deve poter riscrivere un risultato buono.
        if (job.status === "succeeded" || job.status === "dead") return null;

        const now = Date.now();

        // Consegnato due volte mentre è ancora in volo: la seconda è uno scarto,
        // non un tentativo. Contarla come tentativo esaurirebbe `maxAttempts`
        // senza aver mai fallito davvero.
        if (job.status === "running" && (job.leaseExpiresAt ?? 0) > now) return null;

        await ctx.db.patch(args.jobId, {
            status: "running",
            attempt: job.attempt + 1,
            leaseExpiresAt: now + RUN_LEASE_MS,
            startedAt: job.startedAt ?? now,
            updatedAt: now,
            lastError: undefined,
        });

        return { name: job.name, payload: (job.payload ?? {}) as Record<string, unknown> };
    },
});

export const finish = internalMutation({
    args: {
        jobId: v.id("jobExecutions"),
        outcome: v.union(v.literal("succeeded"), v.literal("failed")),
        result: v.optional(v.any()),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ status: string; retryAt: number | null }> => {
        const job = await ctx.db.get(args.jobId);
        if (!job) return { status: "missing", retryAt: null };

        const now = Date.now();

        if (args.outcome === "succeeded") {
            await ctx.db.patch(args.jobId, {
                status: "succeeded",
                finishedAt: now,
                updatedAt: now,
                ...(args.result === undefined ? {} : { result: args.result }),
                nextAttemptAt: undefined,
                leaseExpiresAt: undefined,
                lastError: undefined,
            });
            return { status: "succeeded", retryAt: null };
        }

        // `attempt` è già stato incrementato da `markRunning`: il confronto è fra
        // tentativi *consumati* e tetto, non fra fallimenti e tetto.
        const attemptsLeft = job.attempt < job.maxAttempts;
        const retryAt = attemptsLeft ? now + RETRY_DELAY_MS : null;

        await ctx.db.patch(args.jobId, {
            status: attemptsLeft ? "pending" : "dead",
            updatedAt: now,
            lastError: args.error ?? "unknown error",
            // Il lease si rilascia comunque: il tentativo è finito, e un `pending`
            // con un lease residuo non potrebbe essere ripreso.
            leaseExpiresAt: undefined,
            ...(retryAt === null ? { finishedAt: now } : { nextAttemptAt: retryAt }),
        });

        return { status: attemptsLeft ? "pending" : "dead", retryAt };
    },
});

export const run = internalAction({
    args: { jobId: v.id("jobExecutions") },
    handler: async (ctx, args): Promise<{ status: string }> => {
        const running: { name: string; payload: Record<string, unknown> } | null = await ctx.runMutation(
            internal.jobs.markRunning,
            { jobId: args.jobId },
        );
        if (!running) return { status: "skipped" };

        try {
            const result = await dispatch(ctx, running.name, running.payload);
            const finished: { status: string } = await ctx.runMutation(internal.jobs.finish, {
                jobId: args.jobId,
                outcome: "succeeded",
                result,
            });
            return { status: finished.status };
        } catch (error) {
            const finished: { status: string; retryAt: number | null } = await ctx.runMutation(
                internal.jobs.finish,
                {
                    jobId: args.jobId,
                    outcome: "failed",
                    error: errorMessage(error),
                },
            );

            // Il retry non è silenzioso: ri-schedula lo stesso job. Un `dead` non
            // viene ri-schedulato — è terminale e leggibile in tabella.
            if (finished.status === "pending" && finished.retryAt !== null) {
                await ctx.scheduler.runAfter(finished.retryAt - Date.now(), internal.jobs.run, {
                    jobId: args.jobId,
                });
            }
            return { status: finished.status };
        }
    },
});

async function dispatch(
    ctx: ActionCtx,
    name: string,
    payload: Record<string, unknown>,
): Promise<unknown> {
    if (name === "data-export") return await runDataExport(ctx, payload);
    if (name === "account-purge") return await runAccountPurge(ctx, payload);

    // Irraggiungibile dal percorso normale (`enqueueJob` rifiuta i tipi non
    // registrati) ma non silenzioso: un nome sconosciuto in tabella è un errore
    // di programmazione che va visto, non un job "riuscito" a vuoto.
    throw new Error(`JOB_RUNNER_NOT_IMPLEMENTED: ${name}`);
}

// ---------------------------------------------------------------------------
// data-export
// ---------------------------------------------------------------------------

function base64OfJson(value: unknown): { base64: string; byteLength: number } {
    const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let base64 = "";
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index]!;
        const second = bytes[index + 1];
        const third = bytes[index + 2];

        base64 += alphabet[first >> 2];
        base64 += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
        base64 += second === undefined ? "=" : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
        base64 += third === undefined ? "=" : alphabet[third & 0x3f];
    }

    return { base64, byteLength: bytes.length };
}

interface DataExportPayload {
    exportId?: string;
}

async function runDataExport(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const exportId = (payload as DataExportPayload).exportId as Id<"dataExports"> | undefined;
    if (!exportId) throw new Error("DATA_EXPORT_JOB_WITHOUT_EXPORT_ID");

    const row: Doc<"dataExports"> | null = await ctx.runQuery(internal.dataExports.exportRow, {
        exportId,
    });
    if (!row) throw new Error(`DATA_EXPORT_NOT_FOUND: ${exportId}`);

    const shouldProcess: boolean = await ctx.runMutation(internal.dataExports.markProcessing, {
        exportId,
    });
    if (!shouldProcess) return { skipped: true, reason: "already_completed" };

    const collected = await ctx.runQuery(internal.dataExports.collectPayload, {
        appUserId: row.userId,
    });

    const storageKey: string = await ctx.runQuery(internal.dataExports.storageKeyFor, {
        appUserId: row.userId,
        exportId,
    });

    const { base64, byteLength } = base64OfJson(collected);

    // Il document JSON non viaggia mai verso Convex: va dal runtime del job al
    // bucket, attraverso il bridge che possiede le credenziali R2.
    await callBridge(BRIDGE_PATH.object, { op: "put", key: storageKey, body: base64 });

    await ctx.runMutation(internal.dataExports.markCompleted, {
        exportId,
        storageKey,
        fileSize: byteLength,
    });

    return { storageKey, fileSize: byteLength };
}

// ---------------------------------------------------------------------------
// account-purge
// ---------------------------------------------------------------------------

interface PurgePlanOrganization {
    organizationId: Id<"organizations">;
    soleMember: boolean;
    newOwnerId: Id<"appUsers"> | null;
    fileKeys: string[];
}

async function runAccountPurge(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const limit = typeof payload.limit === "number" ? payload.limit : 20;
    const due: Array<{ appUserId: Id<"appUsers">; authUserId: string }> = await ctx.runQuery(
        internal.profile.dueAccounts,
        { limit },
    );

    let purged = 0;
    const skipped: string[] = [];

    for (const account of due) {
        // Isolamento per utente: un fallimento non aborta il batch (legacy: stesso
        // try/catch per utente).
        try {
            const plan: { authUserId: string | null; organizations: PurgePlanOrganization[] } =
                await ctx.runQuery(internal.profile.purgePlan, { appUserId: account.appUserId });

            const deleteOrganizations: Id<"organizations">[] = [];
            const keepOrganizations: Id<"organizations">[] = [];
            const transferOwnership: Array<{
                organizationId: Id<"organizations">;
                newOwnerId: Id<"appUsers">;
            }> = [];
            let r2Blocked = false;

            for (const organization of plan.organizations) {
                if (!organization.soleMember) {
                    if (organization.newOwnerId) {
                        transferOwnership.push({
                            organizationId: organization.organizationId,
                            newOwnerId: organization.newOwnerId,
                        });
                    } else {
                        keepOrganizations.push(organization.organizationId);
                    }
                    continue;
                }

                // Gli oggetti R2 si cancellano **prima** delle righe: se un delete
                // fallisce, le righe restano e il riferimento agli oggetti non si
                // perde. Il legacy lo diceva nel commento ma poi cancellava l'utente
                // comunque, rendendo il residuo irraggiungibile per sempre; qui
                // l'account viene saltato e riprovato al giro successivo.
                let failed = false;
                for (const key of organization.fileKeys) {
                    try {
                        await callBridge(BRIDGE_PATH.object, { op: "delete", key });
                    } catch (error) {
                        failed = true;
                        console.error("[jobs] purge: R2 delete failed", key, errorMessage(error));
                    }
                }

                if (failed) {
                    r2Blocked = true;
                    continue;
                }
                deleteOrganizations.push(organization.organizationId);
            }

            if (r2Blocked) {
                skipped.push(`${account.appUserId}:r2_delete_failed`);
                continue;
            }

            await ctx.runMutation(internal.profile.purgeApply, {
                appUserId: account.appUserId,
                authUserId: plan.authUserId,
                deleteOrganizations,
                transferOwnership,
                keepOrganizations,
            });
            purged += 1;
        } catch (error) {
            skipped.push(`${account.appUserId}:${errorMessage(error)}`);
            console.error("[jobs] purge failed for account", account.appUserId, error);
        }
    }

    return { scanned: due.length, purged, skipped };
}

/** Pulizia best-effort usata dai test e dal Task 13 per gli oggetti orfani. */
export const deleteObject = internalAction({
    args: { key: v.string() },
    handler: async (_ctx, args): Promise<void> => {
        await tryBridge(BRIDGE_PATH.object, { op: "delete", key: args.key });
    },
});
