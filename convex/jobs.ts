import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { errorCode, requireReason } from "./lib/adminGuards";
import { writeAudit } from "./lib/audit";
import {
    FALLBACK_INVITE_BODY,
    applyInvitePlaceholders,
    buildEventDashboardUrl,
    buildGuestInviteLink,
    buildGuestPixelUrl,
    resolveOrganizationTier,
} from "./lib/domain";
import { emailSubjects } from "./lib/emailSubjects";
import { forbidden } from "./lib/identity";
import { JOB_TYPES, enqueueJob, retryDelayMs } from "./lib/jobQueue";
import { BRIDGE_PATH, callBridge, errorMessage, tryBridge } from "./lib/storageBridge";
import { PREVIEW_TOKEN } from "./lib/previewToken";
import { requireEnv, siteUrl } from "./lib/env";
import { buildOrgInviteLink, deriveInvitationToken } from "./lib/invitationToken";
import { hashInvitationToken } from "./organizations";
import { buildTestInviteEmail } from "./guests";
import { readSiteMode } from "./siteSettings";
import type { SiteMode } from "./siteSettings";
import { sideEffectsAllowed } from "./lib/writeGuard";
import type { ReadCtx } from "./lib/identity";

/**
 * Esecutore dei job e produttori dei cron (plan Task 13).
 *
 * Il "worker" è una Convex function: nessun processo, nessun polling. `enqueueJob`
 * scrive la riga e schedula `run`, che è l'unico consumatore. Lo stato vive in
 * `jobExecutions` — `pending → running → succeeded | retrying → running | dead` —
 * quindi un tentativo è ispezionabile invece di essere una riga di log.
 *
 * Tre proprietà che questo file deve garantire, e che il legacy non aveva:
 *
 * 1. **Retry persistito.** Il ritardo del prossimo tentativo è scritto nella riga
 *    (`nextAttemptAt`) e consegnato dallo scheduler. Se lo scheduler perde una
 *    consegna — o un'istanza muore a metà di un job `running` — il cron
 *    `cronRecoverStalledJobs` riprende la riga dallo stato, non da un log.
 * 2. **Un solo esecutore alla volta.** `markRunning` rivendica il job con un lease:
 *    una seconda consegna dello stesso `jobId` mentre il primo tentativo è in volo
 *    è uno scarto, non un tentativo (contarla esaurirebbe `maxAttempts` senza che
 *    nulla sia fallito). Un lease scaduto rende riprendibile un job orfano.
 * 3. **Nessun segreto nello stato.** Il provider id (o un errore sanitizzato) è
 *    tutto ciò che `recordOutcome` scrive: la chiave Resend resta nell'action che
 *    la legge.
 *
 * La separazione mutation/action è quella che impone il runtime: la mutation crea,
 * rivendica e chiude il job; l'action fa la rete (Resend, bridge media/R2) e non
 * tocca mai `jobExecutions` direttamente.
 */

/**
 * Site-mode gate for crons and jobs (final review C2).
 *
 * Returns the blocking mode (and logs it) when side effects are paused, `null`
 * when the caller may proceed. Outside `active` the green deployment must not
 * email anyone, delete anything or call a provider: see `lib/writeGuard.ts`.
 */
export type SiteModeSkip = { skipped: "site_mode"; mode: SiteMode };

async function pausedBySiteMode(ctx: ReadCtx, what: string): Promise<SiteModeSkip | null> {
    const mode = await readSiteMode(ctx);
    if (sideEffectsAllowed(mode)) return null;
    console.log(`[jobs] ${what} skipped: site mode is ${mode}`);
    return { skipped: "site_mode", mode };
}

/** Same gate for an action (crons that talk to the network directly). */
async function pausedBySiteModeInAction(ctx: ActionCtx, what: string): Promise<SiteModeSkip | null> {
    const { mode }: { mode: SiteMode } = await ctx.runQuery(internal.siteSettings.getForWorker, {});
    if (sideEffectsAllowed(mode)) return null;
    console.log(`[jobs] ${what} skipped: site mode is ${mode}`);
    return { skipped: "site_mode", mode };
}

/** Lease del diritto esclusivo di esecuzione. */
const RUN_LEASE_MS = 10 * 60 * 1000;

/** Tetto al lavoro di un singolo giro di cron. */
const CRON_BATCH = 20;

/** Sotto-lotto dei figli di un evento cancellato in un passaggio del cron. */
const EVENT_CHILD_BATCH = 100;

export const getJob = internalQuery({
    args: { jobId: v.id("jobExecutions") },
    handler: async (ctx, args): Promise<Doc<"jobExecutions"> | null> => await ctx.db.get(args.jobId),
});

/**
 * Rivendica il job per l'esecuzione, restituendo nome e payload.
 *
 * `null` significa "non tocca a questa consegna": job assente, già concluso, già in
 * volo (lease valido) o terminale. Il chiamante non distingue i casi di proposito —
 * l'unica azione sensata è fermarsi.
 *
 * `{ deferred }` (final review C2): the site is not `active`, so the job is left
 * exactly as it is — same status, no attempt consumed, no lease — and
 * `cronRecoverStalledJobs` redelivers it once the mode is `active` again.
 */
export const markRunning = internalMutation({
    args: { jobId: v.id("jobExecutions") },
    handler: async (
        ctx,
        args,
    ): Promise<{ name: string; payload: Record<string, unknown> } | { deferred: SiteMode } | null> => {
        const job = await ctx.db.get(args.jobId);
        if (!job) return null;

        const paused = await pausedBySiteMode(ctx, `job ${job.name} (${job._id})`);
        if (paused) return { deferred: paused.mode };

        // `failed` è il valore scritto dal Task 12 (mai da un percorso nuovo): è
        // terminale come `dead`, e riprenderlo riscriverebbe un esito già deciso.
        if (job.status === "succeeded" || job.status === "dead" || job.status === "failed") {
            return null;
        }

        const now = Date.now();

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

/**
 * Registra l'esito di un tentativo (plan Task 13, Step 2: `recordOutcome`).
 *
 * Il successo è terminale. Il fallimento no: con budget residuo il job passa a
 * `retrying` con il prossimo tentativo pianificato — **il ritardo è calcolato qui**,
 * dove il numero di tentativi è autorevole, non nel chiamante. Esaurito il budget,
 * `dead` con `finishedAt`: una riga terminale che nessun ciclo riprende da solo.
 *
 * `providerId` è separato da `result` per una ragione pratica: è l'unico campo che
 * serve per correlare un job a un messaggio dal lato del provider, e nasconderlo
 * dentro un oggetto libero lo renderebbe non interrogabile.
 */
export const recordOutcome = internalMutation({
    args: {
        jobId: v.id("jobExecutions"),
        outcome: v.union(v.literal("succeeded"), v.literal("failed")),
        result: v.optional(v.any()),
        providerId: v.optional(v.string()),
        error: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ status: string; retryAt: number | null; attempt: number }> => {
        const job = await ctx.db.get(args.jobId);
        if (!job) return { status: "missing", retryAt: null, attempt: 0 };

        const now = Date.now();

        if (args.outcome === "succeeded") {
            await ctx.db.patch(args.jobId, {
                status: "succeeded",
                finishedAt: now,
                updatedAt: now,
                ...(args.result === undefined ? {} : { result: args.result }),
                ...(args.providerId === undefined ? {} : { providerId: args.providerId }),
                nextAttemptAt: undefined,
                leaseExpiresAt: undefined,
                lastError: undefined,
            });
            return { status: "succeeded", retryAt: null, attempt: job.attempt };
        }

        // `attempt` è già stato incrementato da `markRunning`: il confronto è fra
        // tentativi *consumati* e tetto, non fra fallimenti e tetto.
        const attemptsLeft = job.attempt < job.maxAttempts;
        const retryAt = attemptsLeft ? now + retryDelayMs(job.attempt) : null;

        await ctx.db.patch(args.jobId, {
            status: attemptsLeft ? "retrying" : "dead",
            updatedAt: now,
            lastError: args.error ?? "unknown error",
            // Il lease si rilascia comunque: il tentativo è finito, e un job in
            // attesa con un lease residuo non potrebbe essere ripreso dal cron.
            leaseExpiresAt: undefined,
            ...(retryAt === null ? { finishedAt: now, nextAttemptAt: undefined } : { nextAttemptAt: retryAt }),
        });

        return { status: attemptsLeft ? "retrying" : "dead", retryAt, attempt: job.attempt };
    },
});

/**
 * Rimette in coda un job `dead` (plan Task 13, Step 1: `dead → pending` **solo** da
 * superAdmin).
 *
 * Il budget dei tentativi riparte da zero, ed è deliberato: un job arriva `dead`
 * dopo aver consumato cinque tentativi con backoff, quindi riprenderlo con il
 * budget esaurito lo farebbe morire al primo fallimento — cioè un "retry" che non
 * ritenta. Il numero di tentativi precedenti resta nell'audit.
 */
export const retryDead = internalMutation({
    args: { jobId: v.id("jobExecutions"), reason: v.string() },
    handler: async (ctx, args): Promise<{ retried: boolean; reason?: string }> => {
        // Task 15 fix round 1: the public door is `api.admin.retryJob` (superAdmin
        // session, reason, audit). This one is the deployment CLI's
        // (`npx convex run jobs:retryDead`), with the same mandatory reason.
        return await retryDeadJob(ctx, null, args.jobId, requireReason(args.reason));
    },
});

/**
 * The `dead → pending` transition, shared by `retryDead` (CLI) and the admin
 * console (`admin.retryJob`, Task 15), so the two cannot drift. The caller has
 * already authorized the operator (`actor === null` means the deployment CLI)
 * and validated the reason, which lands in the audit.
 */
export async function retryDeadJob(
    ctx: MutationCtx,
    actor: Doc<"appUsers"> | null,
    jobId: Id<"jobExecutions">,
    operatorReason: string,
): Promise<{ retried: boolean; reason?: string }> {
    const job = await ctx.db.get(jobId);
    if (!job) throw forbidden("JOB_NOT_FOUND", { jobId });

    // Un job vivo non si "riprende": o è già in coda (niente da fare) o è in
    // volo (riprenderlo lo duplicherebbe).
    if (job.status !== "dead" && job.status !== "failed") {
        return { retried: false, reason: `status_${job.status}` };
    }

    const now = Date.now();
    await ctx.db.patch(job._id, {
        status: "pending",
        attempt: 0,
        nextAttemptAt: now,
        leaseExpiresAt: undefined,
        finishedAt: undefined,
        lastError: undefined,
        updatedAt: now,
    });

    await writeAudit(ctx, {
        action: "admin.job_retried",
        ...(actor ? { actorAppUserId: actor._id, actorAuthUserId: actor.authUserId } : {}),
        targetType: "job",
        targetId: job._id,
        details: {
            reason: operatorReason,
            source: actor ? "admin_console" : "deployment_cli",
            name: job.name,
            previousAttempts: job.attempt,
            // A code, never the stored text: provider errors may carry personal data.
            lastErrorCode: errorCode(job.lastError),
        },
    });

    await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: job._id });

    return { retried: true };
}

export const run = internalAction({
    args: { jobId: v.id("jobExecutions") },
    handler: async (ctx, args): Promise<{ status: string }> => {
        const claim:
            | { name: string; payload: Record<string, unknown> }
            | { deferred: SiteMode }
            | null = await ctx.runMutation(internal.jobs.markRunning, { jobId: args.jobId });
        if (!claim) return { status: "skipped" };
        if ("deferred" in claim) return { status: "deferred" };
        const running = claim;

        try {
            const result = (await dispatch(ctx, running.name, running.payload)) as
                | { providerId?: string }
                | undefined;

            const finished: { status: string } = await ctx.runMutation(internal.jobs.recordOutcome, {
                jobId: args.jobId,
                outcome: "succeeded",
                result: result ?? null,
                ...(result?.providerId ? { providerId: result.providerId } : {}),
            });
            return { status: finished.status };
        } catch (error) {
            const finished: { status: string; retryAt: number | null } = await ctx.runMutation(
                internal.jobs.recordOutcome,
                {
                    jobId: args.jobId,
                    outcome: "failed",
                    error: errorMessage(error),
                },
            );

            // Il retry non è silenzioso: ri-schedula lo stesso job. Un `dead` non
            // viene ri-schedulato — è terminale e leggibile in tabella.
            if (finished.status === "retrying" && finished.retryAt !== null) {
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
    if (name === JOB_TYPES.dataExport) return await runDataExport(ctx, payload);
    if (name === JOB_TYPES.accountPurge) return await runAccountPurge(ctx, payload);
    if (name === JOB_TYPES.sendInviteEmail) return await runSendInviteEmail(ctx, payload);
    if (name === JOB_TYPES.sendReminderEmail) return await runSendReminderEmail(ctx, payload);
    if (name === JOB_TYPES.sendTestInviteEmail) return await runSendTestInviteEmail(ctx, payload);
    if (name === JOB_TYPES.sendOrgInviteEmail) return await runSendOrgInviteEmail(ctx, payload);
    if (name === JOB_TYPES.imageVariant) return await runImageVariant(ctx, payload);
    if (name === JOB_TYPES.eventCleanupWarning) return await runEventCleanupWarning(ctx, payload);

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

// ---------------------------------------------------------------------------
// send-invite-email / send-reminder-email
// ---------------------------------------------------------------------------

/**
 * Contesto di invio di un ospite: l'ospite, il suo evento e se ha già risposto.
 *
 * Una sola query per entrambi i job di email perché il legacy aveva una sola
 * funzione (`findGuestForEmail`) per entrambi: due ricerche parallele sarebbero due
 * punti in cui il filtro "ospite rimosso" può divergere.
 */
export const guestEmailContext = internalQuery({
    args: { guestId: v.id("guests") },
    handler: async (
        ctx,
        args,
    ): Promise<{
        guest: Doc<"guests">;
        event: Doc<"events">;
        hasResponse: boolean;
    } | null> => {
        const guest = await ctx.db.get(args.guestId);
        if (!guest) return null;

        const event = await ctx.db.get(guest.eventId);
        if (!event) return null;

        const response = await ctx.db
            .query("rsvpResponses")
            .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
            .first();

        return { guest, event, hasResponse: response !== null };
    },
});

/** Reminder di invio, con la guardia di appartenenza all'evento lasciata al chiamante. */
export const reminderForSend = internalQuery({
    args: { reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<Doc<"eventReminders"> | null> => await ctx.db.get(args.reminderId),
});

/** Il reminder è già stato registrato come inviato a questo ospite? */
export const hasReminderActivity = internalQuery({
    args: { guestId: v.id("guests"), reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<boolean> => {
        const row = await ctx.db
            .query("guestActivities")
            .withIndex("by_guest_reminder", (q) =>
                q.eq("guestId", args.guestId).eq("type", "reminder_sent").eq("reminderId", args.reminderId),
            )
            .first();

        return row !== null;
    },
});

/**
 * Registra l'invio riuscito di un reminder.
 *
 * Idempotente per costruzione: la chiave è la stessa che il legacy teneva in un
 * indice unico su espressione JSONB, qui promossa a indice reale. Nel legacy la
 * corsa fra due retry finiva nel ramo `23505`; qui il controllo e l'insert sono la
 * stessa transazione, quindi non esiste la corsa.
 */
export const recordReminderActivity = internalMutation({
    args: { guestId: v.id("guests"), reminderId: v.id("eventReminders") },
    handler: async (ctx, args): Promise<{ recorded: boolean }> => {
        const guest = await ctx.db.get(args.guestId);
        if (!guest) return { recorded: false };

        const existing = await ctx.db
            .query("guestActivities")
            .withIndex("by_guest_reminder", (q) =>
                q.eq("guestId", args.guestId).eq("type", "reminder_sent").eq("reminderId", args.reminderId),
            )
            .first();
        if (existing) return { recorded: false };

        await ctx.db.insert("guestActivities", {
            organizationId: guest.organizationId,
            eventId: guest.eventId,
            guestId: guest._id,
            type: "reminder_sent",
            // `meta.reminderId` resta per parità con le righe legacy; la colonna
            // `reminderId` è la chiave indicizzata (vedi schema).
            meta: { reminderId: args.reminderId },
            reminderId: args.reminderId,
            createdAt: Date.now(),
        });

        return { recorded: true };
    },
});

async function runSendInviteEmail(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const guestId = payload.guestId as Id<"guests"> | undefined;
    if (!guestId) throw new Error("SEND_INVITE_JOB_WITHOUT_GUEST_ID");

    const context = await ctx.runQuery(internal.jobs.guestEmailContext, { guestId });
    // Skip **silenziosi**: l'ospite può essere stato rimosso o privato dell'email
    // fra l'accodamento e la consegna. Un errore qui farebbe ritentare cinque volte
    // qualcosa che non ha più destinatario.
    if (!context) return { skipped: "guest_not_found" };
    if (context.guest.removedAt !== undefined) return { skipped: "guest_removed" };
    if (!context.guest.email) return { skipped: "guest_without_email" };

    const link = buildGuestInviteLink(context.event.slug, context.guest.token);
    const values = { nome: context.guest.firstName, link };
    const subject = applyInvitePlaceholders(
        context.event.distribution.emailSubject || emailSubjects.guestInvite(context.event.title),
        values,
    );
    const message = applyInvitePlaceholders(
        context.event.distribution.emailBody || FALLBACK_INVITE_BODY,
        values,
    );

    const result: { sent: boolean; messageId: string | null; reason?: string } = await ctx.runAction(
        internal.email.sendTemplate,
        {
            request: {
                template: "guest-invite",
                to: context.guest.email,
                subject,
                eventTitle: context.event.title,
                firstName: context.guest.firstName,
                message,
                ctaUrl: link,
                pixelUrl: buildGuestPixelUrl(context.guest.token),
            },
            eventScoped: true,
            context: {
                organizationId: context.guest.organizationId,
                guestId: context.guest._id,
                eventId: context.guest.eventId,
            },
        },
    );

    return {
        sent: result.sent,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.messageId ? { providerId: result.messageId } : {}),
    };
}

/**
 * `send-test-invite-email` (Task 14): the organizer's "send a test to me".
 *
 * Everything is resolved now, not when the request was queued (the payload is the
 * request id). A request whose event or requester is gone is a silent skip, like
 * a removed guest for the invite. The Resend idempotency key is per request: a
 * retry after a timeout in which the provider did accept the email does not send
 * a second one. A suppressed address is a terminal "not sent", not a retry.
 */
async function runSendTestInviteEmail(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const testRequestId = payload.testRequestId as Id<"inviteTestRequests"> | undefined;
    if (!testRequestId) throw new Error("SEND_TEST_JOB_WITHOUT_REQUEST_ID");

    const context = await ctx.runQuery(internal.guests.testEmailContext, { testRequestId });
    if (!context) return { skipped: "request_target_gone" };

    const email = await buildTestInviteEmail(context);
    const result: { sent: boolean; messageId: string | null; reason?: string } = await ctx.runAction(
        internal.email.sendTemplate,
        {
            request: {
                template: "guest-invite",
                to: context.to,
                subject: email.subject,
                eventTitle: context.title,
                firstName: email.firstName,
                message: email.message,
                ctaUrl: email.link,
                pixelUrl: buildGuestPixelUrl(PREVIEW_TOKEN),
            },
            // Legacy `type: "custom"`: the transactional sender, not the tracked
            // events subdomain — a test must not pollute the invite metrics.
            eventScoped: false,
            idempotencyKey: `invite-test/${testRequestId}`,
            context: { organizationId: context.organizationId },
        },
    );

    return {
        sent: result.sent,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.messageId ? { providerId: result.messageId } : {}),
    };
}

/**
 * `send-org-invite-email` (Task 14, part b): the organization invitation.
 *
 * Legacy parity with the Better Auth plugin hook (`server/utils/auth.ts`,
 * `sendInvitationEmail`): same template (`org-invite`), inviter name with the
 * organization name as fallback, language from the inviter's locale. What
 * changes is the link — `{SITE_URL}/invite/{token}` instead of the plugin's
 * invitation id — and the delivery, which is now retried and idempotent.
 *
 * The token is re-derived from the invitation id and checked against the stored
 * hash before anything is sent: if they disagree (the secret rotated after the
 * invitation was created), the link would be dead, and a terminal skip is better
 * than five deliveries of the same useless email.
 */
async function runSendOrgInviteEmail(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const invitationId = payload.invitationId as Id<"invitations"> | undefined;
    if (!invitationId) throw new Error("SEND_ORG_INVITE_JOB_WITHOUT_INVITATION_ID");

    const context = await ctx.runQuery(internal.organizations.orgInviteEmailContext, { invitationId });
    if ("skipped" in context) return { skipped: context.skipped };

    const token = await deriveInvitationToken(requireEnv("BETTER_AUTH_SECRET"), invitationId);
    if (!context.tokenHash || (await hashInvitationToken(token)) !== context.tokenHash) {
        return { skipped: "token_mismatch" };
    }

    const inviteUrl = buildOrgInviteLink(siteUrl(), token);
    const language = context.inviterLocale?.toLowerCase().startsWith("en") ? "en" : "it";
    const expiresInDays = Math.max(1, Math.ceil((context.expiresAt - Date.now()) / DAY_MS));

    const result: { sent: boolean; messageId: string | null; reason?: string } = await ctx.runAction(
        internal.email.sendTemplate,
        {
            request: {
                template: "org-invite",
                to: context.email,
                language,
                inviteUrl,
                orgName: context.organizationName,
                invitedByName: context.inviterName || context.organizationName,
                expiresInDays,
            },
            // Transactional sender (legacy `type: "invitation"`), not an event email.
            eventScoped: false,
            idempotencyKey: `org-invite/${invitationId}`,
            context: { organizationId: context.organizationId },
        },
    );

    return {
        sent: result.sent,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.messageId ? { providerId: result.messageId } : {}),
    };
}

async function runSendReminderEmail(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const guestId = payload.guestId as Id<"guests"> | undefined;
    const reminderId = payload.reminderId as Id<"eventReminders"> | undefined;
    if (!guestId || !reminderId) throw new Error("SEND_REMINDER_JOB_WITHOUT_IDS");

    const context = await ctx.runQuery(internal.jobs.guestEmailContext, { guestId });
    if (!context) return { skipped: "guest_not_found" };
    if (context.guest.removedAt !== undefined) return { skipped: "guest_removed" };
    if (!context.guest.email) return { skipped: "guest_without_email" };
    if (context.guest.remindersDisabled) return { skipped: "reminders_disabled" };
    // Chi ha già risposto non va sollecitato: è la stessa guardia del legacy, ed è
    // valutata **adesso**, non quando il cron ha accodato il job.
    if (context.hasResponse) return { skipped: "already_responded" };

    const reminder = await ctx.runQuery(internal.jobs.reminderForSend, { reminderId });
    if (!reminder || reminder.eventId !== context.guest.eventId) {
        return { skipped: "reminder_not_for_event" };
    }

    // Idempotenza veloce: evita render e invio se è già tracciato.
    const alreadySent: boolean = await ctx.runQuery(internal.jobs.hasReminderActivity, {
        guestId,
        reminderId,
    });
    if (alreadySent) return { skipped: "already_sent" };

    const link = buildGuestInviteLink(context.event.slug, context.guest.token);
    const values = { nome: context.guest.firstName, link };
    const subject = applyInvitePlaceholders(reminder.subject, values);
    const message = applyInvitePlaceholders(reminder.message, values);

    const result: { sent: boolean; messageId: string | null; reason?: string } = await ctx.runAction(
        internal.email.sendTemplate,
        {
            request: {
                template: "guest-reminder",
                to: context.guest.email,
                subject,
                eventTitle: context.event.title,
                firstName: context.guest.firstName,
                message,
                ctaUrl: link,
                pixelUrl: buildGuestPixelUrl(context.guest.token),
            },
            eventScoped: true,
            // La chiave di idempotenza del provider è la stessa coppia del legacy:
            // un retry dopo un timeout di rete non manda due volte.
            idempotencyKey: `reminder/${reminderId}/guest/${guestId}`,
            context: {
                organizationId: context.guest.organizationId,
                guestId: context.guest._id,
                eventId: context.guest.eventId,
            },
        },
    );

    if (!result.sent) {
        return { sent: false, reason: result.reason ?? "not_sent" };
    }

    // L'attività si scrive **dopo** l'invio riuscito (legacy): segnare prima
    // significherebbe dichiarare inviato un reminder che non è partito.
    await ctx.runMutation(internal.jobs.recordReminderActivity, { guestId, reminderId });

    return { sent: true, ...(result.messageId ? { providerId: result.messageId } : {}) };
}

// ---------------------------------------------------------------------------
// image-variant
// ---------------------------------------------------------------------------

async function runImageVariant(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const fileId = payload.fileId as Id<"files"> | undefined;
    if (!fileId) throw new Error("IMAGE_VARIANT_JOB_WITHOUT_FILE_ID");

    // `files.processVariants` è la stessa action che serve il percorso immediato
    // (confirmUpload): una sola implementazione, quindi il recupero del cron non può
    // divergere da ciò che succede a un upload normale.
    const result: { status: string } = await ctx.runAction(internal.files.processVariants, {
        fileId,
    });

    return { variantStatus: result.status };
}

// ---------------------------------------------------------------------------
// event-cleanup-warning
// ---------------------------------------------------------------------------

/**
 * Bersaglio dell'avviso di cleanup, o la ragione per cui non c'è.
 *
 * L'esclusione Atelier è la **prima** operazione, come nel legacy e per la stessa
 * ragione: un cliente pagante non deve mai ricevere un avviso di archiviazione.
 */
export const cleanupWarningTarget = internalQuery({
    args: { eventId: v.id("events") },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { ok: true; organizationId: Id<"organizations">; title: string; email: string; locale: string }
        | { ok: false; reason: string }
    > => {
        const event = await ctx.db.get(args.eventId);
        if (!event) return { ok: false, reason: "event_missing" };
        if (event.cleanupWarnedAt !== undefined) return { ok: false, reason: "already_warned" };

        const tier = await resolveOrganizationTier(ctx, event.organizationId);
        if (tier === "atelier") return { ok: false, reason: "atelier" };

        const owner = await ctx.db
            .query("memberships")
            .withIndex("by_organization_role", (q) =>
                q.eq("organizationId", event.organizationId).eq("role", "owner"),
            )
            .first();
        if (!owner) return { ok: false, reason: "no_owner" };

        const appUser = await ctx.db.get(owner.userId);
        if (!appUser) return { ok: false, reason: "no_owner" };

        return {
            ok: true,
            organizationId: event.organizationId,
            title: event.title,
            email: appUser.email,
            locale: appUser.locale,
        };
    },
});

/** Marca l'evento come avvisato e registra l'audit nella stessa transazione. */
export const markCleanupWarned = internalMutation({
    args: { eventId: v.id("events") },
    handler: async (ctx, args): Promise<{ warned: boolean }> => {
        const event = await ctx.db.get(args.eventId);
        if (!event) return { warned: false };
        // Già avvisato da un altro giro: non si riscrive il timestamp, che è la
        // base temporale della fase di cancellazione (avvisato ≥ 7 giorni fa).
        if (event.cleanupWarnedAt !== undefined) return { warned: false };

        const now = Date.now();
        await ctx.db.patch(event._id, { cleanupWarnedAt: now, updatedAt: now });

        await writeAudit(ctx, {
            action: "event.cleanup_warned",
            organizationId: event.organizationId,
            targetType: "event",
            targetId: event._id,
            details: { daysLeft: CLEANUP_WARN_DAYS_LEFT },
        });

        return { warned: true };
    },
});

async function runEventCleanupWarning(
    ctx: ActionCtx,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const eventId = payload.eventId as Id<"events"> | undefined;
    if (!eventId) throw new Error("CLEANUP_WARNING_JOB_WITHOUT_EVENT_ID");

    const target = await ctx.runQuery(internal.jobs.cleanupWarningTarget, { eventId });
    if (!target.ok) return { skipped: target.reason };

    const language = target.locale === "en" ? "en" : "it";
    const dashboardUrl = buildEventDashboardUrl(eventId);

    await ctx.runAction(internal.email.sendTemplate, {
        request: {
            template: "event-cleanup-warning",
            to: target.email,
            language,
            eventTitle: target.title,
            dashboardUrl,
            daysLeft: CLEANUP_WARN_DAYS_LEFT,
        },
    });

    // Marcatura **dopo** l'invio riuscito, come il legacy. La conseguenza è
    // dichiarata: se la marcatura fallisce, il retry rimanda l'avviso. È la
    // direzione sicura — l'opposta (marcare prima) farebbe cancellare un evento
    // senza che l'organizzatore abbia mai ricevuto l'avviso.
    const marked: { warned: boolean } = await ctx.runMutation(internal.jobs.markCleanupWarned, {
        eventId,
    });

    return { warned: marked.warned };
}

// ---------------------------------------------------------------------------
// Cron: produttori
// ---------------------------------------------------------------------------

/** Giorni di preavviso prima della cancellazione automatica (SPEC §9.2). */
export const CLEANUP_WARN_DAYS_LEFT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS_FREE = 30;
const STALE_DAYS_CELEBRATION = 90;

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
    handler: async (ctx, args): Promise<{ enqueued: boolean; due: number } | SiteModeSkip> => {
        const paused = await pausedBySiteMode(ctx, "cron purge-deleted-accounts");
        if (paused) return paused;

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

/** "Concluso": chiuso, con data passata, o con deadline RSVP passata. */
function isConcluded(event: Doc<"events">, now: number): boolean {
    if (event.status === "closed") return true;
    if (event.eventDate !== undefined && event.eventDate < now) return true;
    return event.rsvpDeadline !== undefined && event.rsvpDeadline < now;
}

/**
 * Predicato "stale" del legacy, portato in Convex.
 *
 * La guardia di sicurezza è la stessa e non negoziabile: `freeStale` richiede
 * `eventDate` **nel passato**, altrimenti un matrimonio fra 15 giorni con le RSVP
 * chiuse da 5 verrebbe considerato concluso e cancellato.
 *
 * Nota su ciò che **non** è qui: l'assenza di attività recenti. Nel legacy era una
 * `NOT EXISTS` dentro il predicato; qui è una query separata
 * (`hasRecentActivity`), perché un predicato puro non può interrogare un'altra
 * tabella. Tenerla fuori rende questo pezzo verificabile senza database — ed è la
 * parte che decide se un evento vivo viene cancellato.
 */
function isStale(event: Doc<"events">, now: number): boolean {
    if (!isConcluded(event, now)) return false;

    const freeCutoff = now - STALE_DAYS_FREE * DAY_MS;
    const celebrationCutoff = now - STALE_DAYS_CELEBRATION * DAY_MS;
    const inactive = event.updatedAt < freeCutoff;

    return (
        // Celebration: 90 giorni dopo la data, richiede una data nel passato.
        (event.tier === "celebration" &&
            event.eventDate !== undefined &&
            event.eventDate < celebrationCutoff &&
            inactive) ||
        // Data ignota: solo se chiuso e inattivo. Una bozza senza data non si tocca.
        (event.eventDate === undefined && event.status === "closed" && inactive) ||
        // Free: 30 giorni, sempre con la data nel passato.
        (event.tier !== "celebration" &&
            event.eventDate !== undefined &&
            event.eventDate < now &&
            inactive)
    );
}

/**
 * Il controllo esatto di "nessuna attività recente" (legacy: `NOT EXISTS`).
 *
 * È una query d'intervallo su `(eventId, createdAt)`, non un `collect` filtrato:
 * `take(1)` su un indice non ordinato per data sarebbe un filtro dopo il taglio — e
 * direbbe "nessuna attività" per un evento che ne ha una fuori dal primo documento.
 */
async function hasRecentActivity(
    ctx: MutationCtx,
    eventId: Id<"events">,
    since: number,
): Promise<boolean> {
    const row = await ctx.db
        .query("guestActivities")
        .withIndex("by_event_created", (q) =>
            q.eq("eventId", eventId).gte("createdAt", since),
        )
        .take(1);

    return row.length > 0;
}

/** Quanti eventi inattivi esamina un giro di cron. */
const CRON_SCAN = 200;

/**
 * Cron eventi stale (04:00 UTC): fase warn e fase delete in un solo giro.
 *
 * La cancellazione è un drain a lotti: Convex non ha `ON DELETE CASCADE`, quindi i
 * figli si eliminano in blocchi e la riga dell'evento sparisce nel passaggio in cui
 * i figli sono finiti. Un evento con 3000 ospiti non entra in una transazione, e
 * fingere che ci entri significherebbe un cron che fallisce sempre sul caso che
 * conta.
 */
export const cronCleanupStaleEvents = internalMutation({
    args: { warnLimit: v.optional(v.number()), deleteLimit: v.optional(v.number()) },
    handler: async (
        ctx,
        args,
    ): Promise<{ warned: number; skippedAtelier: number; deleted: number; drained: number } | SiteModeSkip> => {
        const paused = await pausedBySiteMode(ctx, "cron cleanup-stale-events");
        if (paused) return paused;

        const now = Date.now();
        const warnLimit = args.warnLimit ?? CRON_BATCH;
        const deleteLimit = args.deleteLimit ?? 5;

        let warned = 0;
        let skippedAtelier = 0;

        // Scansione **una sola**, e `by_updated_at` è la scelta che la rende
        // completa: ogni ramo di `isStale` richiede `updatedAt < cutoff`, quindi
        // l'insieme dei candidati è un sottoinsieme di "eventi inattivi da 30 giorni".
        // L'indice è ordinato per `updatedAt` crescente, quindi `take` prende i più
        // vecchi — i più urgenti — e l'esplorazione resta limitata.
        //
        // Il campo è obbligatorio nello schema, quindi nessun documento resta fuori
        // dall'indice: è il dettaglio che nel Task 12 ha reso `by_purge_at` una
        // trappola, qui verificato prima di sceglierlo.
        const cutoff = now - STALE_DAYS_FREE * DAY_MS;
        const inactive = await ctx.db
            .query("events")
            .withIndex("by_updated_at", (q) => q.lt("updatedAt", cutoff))
            .take(CRON_SCAN);

        const toWarn: Doc<"events">[] = [];
        const toDelete: Doc<"events">[] = [];
        const activityWindow = now - STALE_DAYS_FREE * DAY_MS;

        for (const event of inactive) {
            if (await hasRecentActivity(ctx, event._id, activityWindow)) continue;

            if (event.cleanupWarnedAt === undefined) {
                // Fase warn: il predicato è valutato alla data dell'avviso (7 giorni
                // avanti), così l'organizzatore viene avvisato *prima* che l'evento
                // diventi eliminabile.
                if (toWarn.length < warnLimit && isStale(event, now + CLEANUP_WARN_DAYS_LEFT * DAY_MS)) {
                    toWarn.push(event);
                }
                continue;
            }

            if (
                toDelete.length < deleteLimit &&
                event.cleanupWarnedAt < now - CLEANUP_WARN_DAYS_LEFT * DAY_MS &&
                isStale(event, now)
            ) {
                toDelete.push(event);
            }
        }

        for (const event of toWarn) {
            const tier = await resolveOrganizationTier(ctx, event.organizationId);
            if (tier === "atelier") {
                skippedAtelier += 1;
                continue;
            }

            await enqueueJob(ctx, {
                type: JOB_TYPES.eventCleanupWarning,
                payload: { eventId: event._id },
                dedupeKey: `event-cleanup-warning:${event._id}`,
            });
            warned += 1;
        }

        let deleted = 0;
        let drained = 0;

        for (const event of toDelete) {
            const tier = await resolveOrganizationTier(ctx, event.organizationId);
            if (tier === "atelier") {
                skippedAtelier += 1;
                continue;
            }

            const { removed, leftover } = await deleteEventChildren(ctx, event._id, EVENT_CHILD_BATCH);
            drained += removed;

            if (leftover) continue; // resto al prossimo giro: i figli finiscono prima

            await ctx.db.delete(event._id);
            await writeAudit(ctx, {
                action: "event.deleted",
                organizationId: event.organizationId,
                targetType: "event",
                targetId: event._id,
                details: { reason: "auto_cleanup", childrenRemoved: removed },
            });
            deleted += 1;
        }

        return { warned, skippedAtelier, deleted, drained };
    },
});

/**
 * Cancella i figli di un evento a lotti, e dice se ne restano.
 *
 * L'ordine non conta per l'integrità (non ci sono foreign key), ma conta per
 * l'osservabilità: se il processo si interrompe a metà, ciò che resta è un evento
 * senza figli, non un figlio senza evento.
 */
async function deleteEventChildren(
    ctx: MutationCtx,
    eventId: Id<"events">,
    batch: number,
): Promise<{ removed: number; leftover: boolean }> {
    let removed = 0;

    const responses = await ctx.db
        .query("rsvpResponses")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch);
    for (const row of responses) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    const activities = await ctx.db
        .query("guestActivities")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch);
    for (const row of activities) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    const reminders = await ctx.db
        .query("eventReminders")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch);
    for (const row of reminders) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    const testRequests = await ctx.db
        .query("inviteTestRequests")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch);
    for (const row of testRequests) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    const guests = await ctx.db
        .query("guests")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .take(batch);
    for (const row of guests) {
        await ctx.db.delete(row._id);
        removed += 1;
    }

    // Un solo documento residuo basta a dire "non ancora": l'evento resta candidato
    // al prossimo giro, quindi una cancellazione parziale non si perde.
    const leftovers = [
        await ctx.db.query("guests").withIndex("by_event", (q) => q.eq("eventId", eventId)).take(1),
        await ctx.db
            .query("rsvpResponses")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .take(1),
        await ctx.db
            .query("guestActivities")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .take(1),
        await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .take(1),
        await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .take(1),
    ];

    return { removed, leftover: leftovers.some((rows) => rows.length > 0) };
}

/**
 * Cron reminder (07:00 UTC): il cron **accoda**, non invia.
 *
 * Per ogni reminder dovuto: claim atomico con lease di 5 minuti (due run
 * concorrenti non processano lo stesso reminder), poi un job per ospite pendente.
 * Se qualche dispatch fallisce il claim si rilascia e il giro successivo riprova —
 * l'insieme degli ospiti può cambiare nel frattempo, quindi ripartire dallo stato
 * attuale è corretto.
 */
export const cronSendDueReminders = internalMutation({
    args: { limit: v.optional(v.number()), guestsPerReminder: v.optional(v.number()) },
    handler: async (
        ctx,
        args,
    ): Promise<{ processed: number; queued: number; skipped: number } | SiteModeSkip> => {
        const paused = await pausedBySiteMode(ctx, "cron send-due-reminders");
        if (paused) return paused;

        const limit = args.limit ?? CRON_BATCH;
        const guestsPerReminder = args.guestsPerReminder ?? 200;

        const due = await ctx.runQuery(internal.reminders.dueReminders, { limit });
        let processed = 0;
        let queued = 0;
        let skipped = 0;

        for (const reminder of due) {
            const claimed: boolean = await ctx.runMutation(internal.reminders.claimForProcessing, {
                reminderId: reminder.reminderId,
            });
            if (!claimed) {
                skipped += 1;
                continue;
            }

            const guests: Array<Id<"guests">> = await ctx.runQuery(internal.reminders.pendingGuests, {
                organizationId: reminder.organizationId,
                eventId: reminder.eventId,
                limit: guestsPerReminder,
            });

            let allQueued = true;
            for (const guestId of guests) {
                try {
                    await enqueueJob(ctx, {
                        type: JOB_TYPES.sendReminderEmail,
                        payload: { guestId, reminderId: reminder.reminderId },
                    });
                    queued += 1;
                } catch (error) {
                    allQueued = false;
                    console.error(
                        "[cron:send-reminders] enqueue failed for guest",
                        guestId,
                        errorMessage(error),
                    );
                }
            }

            if (allQueued) {
                await ctx.runMutation(internal.reminders.markSent, {
                    reminderId: reminder.reminderId,
                });
                processed += 1;
            } else {
                await ctx.runMutation(internal.reminders.releaseProcessing, {
                    reminderId: reminder.reminderId,
                });
            }
        }

        return { processed, queued, skipped };
    },
});

/** Cron varianti immagine: rimette in coda gli originali mai processati. */
export const cronRequeueImageVariants = internalMutation({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ candidates: number; queued: number } | SiteModeSkip> => {
        const paused = await pausedBySiteMode(ctx, "cron requeue-image-variants");
        if (paused) return paused;

        const candidates: Array<Id<"files">> = await ctx.runQuery(internal.media.variantsNeedingWork, {
            limit: args.limit ?? CRON_BATCH,
        });

        let queued = 0;
        for (const fileId of candidates) {
            const result = await enqueueJob(ctx, {
                type: JOB_TYPES.imageVariant,
                payload: { fileId },
                dedupeKey: `image-variant:${fileId}`,
            });
            if (!result.deduplicated) queued += 1;
        }

        return { candidates: candidates.length, queued };
    },
});

/**
 * Riprende i job che lo scheduler ha perso o che sono morti a metà.
 *
 * Tre casi, uno per stato:
 * - `pending`/`retrying` con `nextAttemptAt` passato: la consegna è andata persa.
 *   L'indice è ordinato per `nextAttemptAt`, quindi `take(limit)` prende i più
 *   vecchi — l'ordine giusto per una coda.
 * - `running` con lease scaduto: l'esecuzione è morta. `markRunning` accetta la
 *   ri-consegna solo perché il lease è scaduto, quindi il job riparte come nuovo
 *   tentativo.
 *
 * Riconsegnare un job ancora in volo è sicuro: il lease in `markRunning` rende la
 * seconda consegna uno scarto.
 */
export const cronRecoverStalledJobs = internalMutation({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ rescheduled: number; orphaned: number } | SiteModeSkip> => {
        // Rescheduling alone is harmless (the runner defers), but a sweep that
        // redelivers every pending job each hour only to defer it is noise: the
        // recovery starts with the first hourly run after `active`.
        const paused = await pausedBySiteMode(ctx, "cron recover-stalled-jobs");
        if (paused) return paused;

        const limit = args.limit ?? CRON_BATCH;
        const now = Date.now();
        let rescheduled = 0;

        for (const status of ["pending", "retrying"] as const) {
            const rows = await ctx.db
                .query("jobExecutions")
                .withIndex("by_status_next_attempt", (q) => q.eq("status", status))
                .take(limit);

            for (const row of rows) {
                if (typeof row.nextAttemptAt !== "number" || row.nextAttemptAt > now) continue;
                if ((row.leaseExpiresAt ?? 0) > now) continue;
                await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: row._id });
                rescheduled += 1;
            }
        }

        // I `running` non hanno un `nextAttemptAt` utile: si prende un lotto e si
        // filtra sul lease. Il numero di job in volo è piccolo per costruzione.
        const running = await ctx.db
            .query("jobExecutions")
            .withIndex("by_status_next_attempt", (q) => q.eq("status", "running"))
            .take(limit * 5);

        let orphaned = 0;
        for (const row of running) {
            if ((row.leaseExpiresAt ?? 0) > now) continue;
            await ctx.scheduler.runAfter(0, internal.jobs.run, { jobId: row._id });
            orphaned += 1;
        }

        return { rescheduled, orphaned };
    },
});

/**
 * Cron pulizia file orfani: claim nel database, delete su R2, chiusura.
 *
 * È un'action e non una mutation perché cancella oggetti — rete, non transazione.
 * Il claim è un **lease**: la riga resta `pending` ma con `presignExpiresAt`
 * spostato in avanti, quindi un processo che muore a metà non lascia un orfano
 * invisibile per sempre (che è il difetto dello stato "cleaning" del legacy).
 */
export const cronCleanupOrphanFiles = internalAction({
    args: { limit: v.optional(v.number()), graceHours: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ claimed: number; deleted: number; failed: number } | SiteModeSkip> => {
        // R2 is the shared bucket the legacy stack still serves before step 10.
        const paused = await pausedBySiteModeInAction(ctx, "cron cleanup-orphan-files");
        if (paused) return paused;

        const claimed: Array<{ fileId: Id<"files">; path: string; leaseAt: number }> =
            await ctx.runMutation(internal.files.claimOrphanFiles, {
                limit: args.limit ?? 50,
                graceHours: args.graceHours ?? 1,
            });

        let deleted = 0;
        let failed = 0;

        for (const orphan of claimed) {
            try {
                await callBridge(BRIDGE_PATH.object, { op: "delete", key: orphan.path });
                await ctx.runMutation(internal.files.purgeOrphanFile, {
                    fileId: orphan.fileId,
                    leaseAt: orphan.leaseAt,
                });
                deleted += 1;
            } catch (error) {
                failed += 1;
                console.error("[cron:cleanup-files] delete failed", orphan.path, errorMessage(error));
                // La riga torna candidabile: se l'oggetto non è sparito, il
                // riferimento non deve sparire con lui.
                await ctx.runMutation(internal.files.releaseOrphanFile, {
                    fileId: orphan.fileId,
                    leaseAt: orphan.leaseAt,
                });
            }
        }

        return { claimed: claimed.length, deleted, failed };
    },
});

/** Pulizia best-effort usata dai test e dal purge per gli oggetti orfani. */
export const deleteObject = internalAction({
    args: { key: v.string() },
    handler: async (_ctx, args): Promise<void> => {
        await tryBridge(BRIDGE_PATH.object, { op: "delete", key: args.key });
    },
});
