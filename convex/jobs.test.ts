import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { eventFixture, initConvexTestWithAuthComponent, ranCron } from "./test.setup";
import { JOB_TYPES, enqueueJob, retryDelayMs } from "./lib/jobQueue";
import { signSvixPayload } from "./lib/svix";

/**
 * Task 13 — scheduler, cron, Resend e retry persistito.
 *
 * Le asserzioni vengono dal comportamento legacy e dal piano, non dal codice nuovo:
 * il backoff è la formula del piano (`min(60_000 * 2 ** attempts, 24h)`), i messaggi
 * di rifiuto sono quelli del servizio, gli skip sono quelli che l'handler faceva, e
 * i conteggi replicano le query del repository.
 *
 * `globalThis.fetch` è un registratore per **due** provider: il bridge del Worker
 * (R2/media) e l'API Resend. Così i job girano davvero — attraverso
 * `internal.jobs.run` e lo scheduler di convex-test, mai chiamando il runner al
 * posto suo — senza uscire dalla rete, e si può simulare il guasto che conta: un
 * 429 di Resend, un delete R2 che fallisce.
 *
 * I timer sono finti e `Date` resta reale, per la stessa ragione del Task 12: con
 * i timer veri una consegna può partire dopo la fine del test che l'ha accodata.
 */

type Test = Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>;
type Session = ReturnType<Test["withIdentity"]>;

interface Fixture {
    t: Test;
    s: Session;
    authUserId: string;
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
}

const BRIDGE_URL = "https://worker.test";
const RESEND_URL = "https://api.resend.com/emails";
const SITE_URL = "https://app.test";

interface FetchCall {
    url: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
}

let fetchCalls: FetchCall[] = [];

/** Risposta dell'API Resend: `null` = successo con un id. */
let resendResponder: () => { status: number; body: unknown } = () => ({
    status: 200,
    body: { id: "msg_under_test" },
});

/** Risposta del bridge Worker (R2/media). */
let bridgeResponder: (payload: Record<string, unknown>) => { status: number; body: unknown } = () => ({
    status: 200,
    body: { ok: true },
});

beforeEach(() => {
    fetchCalls = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

    resendResponder = () => ({ status: 200, body: { id: "msg_under_test" } });
    bridgeResponder = () => ({ status: 200, body: { ok: true } });

    process.env.STORAGE_BRIDGE_URL = BRIDGE_URL;
    process.env.STORAGE_BRIDGE_SECRET = "bridge-secret-under-test";
    process.env.SITE_URL = SITE_URL;
    process.env.EVENTS_EMAIL_FROM = "Ceremly <inviti@events.ceremly.test>";
    process.env.APP_NAME = "Ceremly";
    process.env.RESEND_API_KEY = "re_under_test";
    process.env.EMAIL_FROM = "Ceremly <noreply@ceremly.test>";
    // Il mittente delle email di evento è anche uno dei domini che il webhook
    // considera "proprio": una sola fonte per "chi siamo", non due liste.
    process.env.RESEND_WEBHOOK_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    process.env.CONTACT_ADMIN_EMAIL = "admin@ceremly.test";

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const body = typeof init?.body === "string" ? init.body : "";

        const headers: Record<string, string> = {};
        const raw = (init?.headers ?? {}) as Record<string, string>;
        for (const [key, value] of Object.entries(raw)) headers[key.toLowerCase()] = String(value);

        if (target.startsWith(RESEND_URL)) {
            fetchCalls.push({ url: target, payload: JSON.parse(body) as Record<string, unknown>, headers });
            const simulated = resendResponder();
            return new Response(JSON.stringify(simulated.body), {
                status: simulated.status,
                headers: { "content-type": "application/json" },
            });
        }

        let payload: Record<string, unknown> = {};
        try {
            payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
            payload = {};
        }
        fetchCalls.push({ url: target, payload, headers });

        const simulated = bridgeResponder(payload);
        return new Response(JSON.stringify(simulated.body), {
            status: simulated.status,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
});

afterEach(() => {
    vi.useRealTimers();
});

const emailCalls = () => fetchCalls.filter((call) => call.url === RESEND_URL);

async function bootstrap(email = "alice@example.com", name = "Alice"): Promise<Fixture> {
    const t = await initConvexTestWithAuthComponent();
    register(t);

    const created = (await t.run(
        async (ctx) =>
            await ctx.runMutation(components.betterAuth.adapter.create, {
                input: {
                    model: "user",
                    data: {
                        email,
                        name,
                        emailVerified: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                },
            }),
    )) as { _id: string };

    const s = t.withIdentity({ subject: created._id, email, name });
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});

    return {
        t,
        s,
        authUserId: created._id,
        appUserId: provisioned.appUserId,
        organizationId: provisioned.organizationId,
    };
}

const rows = <T extends TableNames>(t: Test, table: T): Promise<Doc<T>[]> =>
    t.run(async (ctx) => await ctx.db.query(table).collect());

const jobRows = (t: Test) => rows(t, "jobExecutions");

const auditActions = async (t: Test): Promise<string[]> =>
    (await rows(t, "auditLogs")).map((row) => row.action).sort();

/** Inserisce un evento attivo con deadline RSVP per la finestra dei reminder. */
async function seedEvent(
    fixture: Fixture,
    overrides: Partial<Omit<Doc<"events">, "_id" | "_creationTime" | "organizationId">> = {},
): Promise<Id<"events">> {
    return await fixture.t.run(
        async (ctx) =>
            await ctx.db.insert(
                "events",
                eventFixture(fixture.organizationId, {
                    status: "active",
                    updatedAt: Date.now(),
                    ...overrides,
                }),
            ),
    );
}

interface GuestSeed {
    firstName?: string;
    email?: string | null;
    token?: string;
    remindersDisabled?: boolean;
    removedAt?: number;
}

async function seedGuest(
    fixture: Fixture,
    eventId: Id<"events">,
    seed: GuestSeed = {},
): Promise<Id<"guests">> {
    const now = Date.now();
    return await fixture.t.run(
        async (ctx) =>
            await ctx.db.insert("guests", {
                organizationId: fixture.organizationId,
                eventId,
                firstName: seed.firstName ?? "Ada",
                lastName: "Lovelace",
                ...(seed.email === null ? {} : { email: seed.email ?? "ada@example.com" }),
                token: seed.token ?? "tok0000001",
                openCount: 0,
                remindersDisabled: seed.remindersDisabled ?? false,
                ...(seed.removedAt === undefined ? {} : { removedAt: seed.removedAt }),
                createdAt: now,
                updatedAt: now,
            }),
    );
}

async function seedReminder(
    fixture: Fixture,
    eventId: Id<"events">,
    daysBefore = 3,
): Promise<Id<"eventReminders">> {
    const now = Date.now();
    return await fixture.t.run(
        async (ctx) =>
            await ctx.db.insert("eventReminders", {
                organizationId: fixture.organizationId,
                eventId,
                daysBefore,
                subject: "Promemoria per {nome}",
                message: "Ciao {nome}, ci sei? {link}",
                enabled: true,
                pending: true,
                createdAt: now,
                updatedAt: now,
            }),
    );
}

/**
 * Fa girare **un solo** passaggio dello scheduler.
 *
 * `finishAllScheduledFunctions` con `vi.runAllTimers()` esaurisce l'intera catena di
 * ritentativi dentro l'orologio finto: un job che fallisce arriverebbe a `dead` in un
 * colpo solo, e l'asserzione "è in `retrying` con il prossimo tentativo fra 2 minuti"
 * sarebbe impossibile da scrivere. Il passaggio singolo — `runAllTimers` fa scattare
 * i `runAfter(0)`, `finishInProgressScheduledFunctions` aspetta che finiscano — è ciò
 * che rende ogni tentativo osservabile separatamente.
 */
async function drainOnce(t: Test): Promise<void> {
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();
}

/** Accoda un job e gli fa fare un tentativo, attraverso lo scheduler. */
async function enqueueAndRun(t: Test, input: Parameters<typeof enqueueJob>[1]): Promise<string> {
    await t.run(async (ctx) => await enqueueJob(ctx as never, input));
    await drainOnce(t);

    const job = (await jobRows(t)).at(-1);
    return job?.status ?? "missing";
}

/** Fa girare lo scheduler senza accodare nulla di nuovo. */
const drain = drainOnce;

// ---------------------------------------------------------------------------
// Macchina a stati
// ---------------------------------------------------------------------------

describe("job state machine", () => {
    it("pending → running → succeeded", async () => {
        const { t } = await bootstrap();

        const status = await enqueueAndRun(t, { type: JOB_TYPES.accountPurge, payload: { limit: 0 } });

        expect(status).toBe("succeeded");
        const job = (await jobRows(t))[0]!;
        expect(job.attempt).toBe(1);
        expect(job.finishedAt).toBeDefined();
        expect(job.leaseExpiresAt).toBeUndefined();
        expect(job.nextAttemptAt).toBeUndefined();
    });

    it("running → retrying → running, con backoff esponenziale e tetto a 24h", async () => {
        const { t } = await bootstrap();
        resendResponder = () => ({ status: 429, body: { message: "rate limited" } });

        const jobId = await t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.sendInviteEmail,
                    status: "pending" as const,
                    attempt: 0,
                    maxAttempts: 5,
                    nextAttemptAt: Date.now(),
                    payload: { guestId: "g" },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        // Tentativo 1: fallisce e pianifica il secondo.
        const first: { status: string; retryAt: number | null } = await t.mutation(
            internal.jobs.markRunning,
            { jobId },
        ).then(async (running) => {
            expect(running).not.toBeNull();
            return await t.mutation(internal.jobs.recordOutcome, {
                jobId,
                outcome: "failed",
                error: "RESEND_429",
            });
        });

        expect(first.status).toBe("retrying");
        const afterFirst = await t.run(async (ctx) => await ctx.db.get(jobId));
        // Il ritardo è la formula del piano, calcolata sui tentativi **consumati**:
        // attempt 1 → 60_000 * 2 = 2 minuti. Il confronto è esatto e non approssimato:
        // `updatedAt` e `nextAttemptAt` sono scritti nella stessa transazione.
        expect(afterFirst!.nextAttemptAt! - afterFirst!.updatedAt).toBe(retryDelayMs(1));
        expect(retryDelayMs(1)).toBe(120_000);
        expect(afterFirst!.lastError).toBe("RESEND_429");

        // Un secondo tentativo: `markRunning` accetta un job `retrying`.
        const run2 = await t.mutation(internal.jobs.markRunning, { jobId });
        expect(run2).not.toBeNull();
        const afterSecond = await t.run(async (ctx) => await ctx.db.get(jobId));
        expect(afterSecond!.attempt).toBe(2);
        expect(afterSecond!.status).toBe("running");

        // Il tetto del backoff: 2 ** 20 è oltre 24h, e il valore è tagliato.
        expect(retryDelayMs(20)).toBe(86_400_000);
    });

    it("running → dead quando il budget è esaurito, e un `dead` non si riprende da solo", async () => {
        const { t } = await bootstrap();

        const jobId = await t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.sendInviteEmail,
                    status: "pending" as const,
                    // Ultimo tentativo disponibile: il prossimo fallimento è terminale.
                    attempt: 4,
                    maxAttempts: 5,
                    nextAttemptAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        await t.mutation(internal.jobs.markRunning, { jobId });
        const outcome = await t.mutation(internal.jobs.recordOutcome, {
            jobId,
            outcome: "failed",
            error: "RESEND_500",
        });

        expect(outcome.status).toBe("dead");
        expect(outcome.retryAt).toBeNull();

        const dead = await t.run(async (ctx) => await ctx.db.get(jobId));
        expect(dead!.finishedAt).toBeDefined();
        expect(dead!.nextAttemptAt).toBeUndefined();

        // `markRunning` su un job terminale è un rifiuto: nessun ciclo riparte da solo.
        expect(await t.mutation(internal.jobs.markRunning, { jobId })).toBeNull();
    });

    it("una seconda consegna mentre il primo tentativo è in volo è uno scarto, non un tentativo", async () => {
        const { t } = await bootstrap();

        const jobId = await t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.sendInviteEmail,
                    status: "pending" as const,
                    attempt: 0,
                    maxAttempts: 5,
                    nextAttemptAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        expect(await t.mutation(internal.jobs.markRunning, { jobId })).not.toBeNull();
        expect(await t.mutation(internal.jobs.markRunning, { jobId })).toBeNull();

        const running = await t.run(async (ctx) => await ctx.db.get(jobId));
        expect(running!.attempt).toBe(1);

        // Lease scaduto: il job torna riprendibile, e il tentativo riparte.
        await t.run(
            async (ctx) => await ctx.db.patch(jobId, { leaseExpiresAt: Date.now() - 1000 }),
        );
        expect(await t.mutation(internal.jobs.markRunning, { jobId })).not.toBeNull();
    });

    it("la stessa idempotency key non crea due job, ma non blocca un `dead`", async () => {
        const { t } = await bootstrap();

        const first = await t.run(
            async (ctx) =>
                await enqueueJob(ctx as never, {
                    type: JOB_TYPES.dataExport,
                    payload: { exportId: "e1" },
                    dedupeKey: "export:user-1",
                }),
        );
        const second = await t.run(
            async (ctx) =>
                await enqueueJob(ctx as never, {
                    type: JOB_TYPES.dataExport,
                    payload: { exportId: "e1" },
                    dedupeKey: "export:user-1",
                }),
        );

        expect(first.deduplicated).toBe(false);
        expect(second.deduplicated).toBe(true);
        expect(second.jobId).toBe(first.jobId);
        expect(await jobRows(t)).toHaveLength(1);

        // `retrying` conta come vivo: il job sta ancora lavorando.
        await t.run(
            async (ctx) =>
                await ctx.db.patch(first.jobId, { status: "retrying" as const, attempt: 1 }),
        );
        const third = await t.run(
            async (ctx) =>
                await enqueueJob(ctx as never, {
                    type: JOB_TYPES.dataExport,
                    payload: { exportId: "e1" },
                    dedupeKey: "export:user-1",
                }),
        );
        expect(third.deduplicated).toBe(true);

        // `dead` no: la chiave descriveva quella richiesta, e l'operatore che la
        // ripete vuole un tentativo nuovo.
        await t.run(async (ctx) => await ctx.db.patch(first.jobId, { status: "dead" as const }));
        const fourth = await t.run(
            async (ctx) =>
                await enqueueJob(ctx as never, {
                    type: JOB_TYPES.dataExport,
                    payload: { exportId: "e1" },
                    dedupeKey: "export:user-1",
                }),
        );
        expect(fourth.deduplicated).toBe(false);
        expect(await jobRows(t)).toHaveLength(2);
    });

    it("dead → pending solo da superAdmin, e il budget dei tentativi riparte", async () => {
        const { t, s, appUserId } = await bootstrap();

        const jobId = await t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.sendInviteEmail,
                    status: "dead" as const,
                    attempt: 5,
                    maxAttempts: 5,
                    lastError: "RESEND_500",
                    finishedAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        // Un utente normale non può: il codice è quello che il client sa distinguere.
        // (Task 15 fix round 1: la porta pubblica è `api.admin.retryJob`, con motivazione.)
        let caught: unknown;
        try {
            await s.mutation(api.admin.retryJob, { jobId, reason: "retry" });
        } catch (error) {
            caught = error;
        }
        expect((caught as { data?: { code?: string } }).data?.code).toBe("SUPER_ADMIN_REQUIRED");

        await t.run(async (ctx) => await ctx.db.patch(appUserId, { globalRole: "superAdmin" }));

        const retried = await s.mutation(api.admin.retryJob, { jobId, reason: "provider back" });
        expect(retried.retried).toBe(true);

        const job = await t.run(async (ctx) => await ctx.db.get(jobId));
        expect(job!.status).toBe("pending");
        expect(job!.attempt).toBe(0);
        expect(job!.lastError).toBeUndefined();
        expect(await auditActions(t)).toContain("admin.job_retried");

        // Un job vivo non è "ripreso": la risposta lo dice invece di duplicarlo.
        const again = await s.mutation(api.admin.retryJob, { jobId, reason: "again" });
        expect(again).toMatchObject({ retried: false, reason: "status_pending" });
    });

    it("la porta CLI (internal.jobs.retryDead) esige la motivazione e la audita senza attore", async () => {
        const { t } = await bootstrap();
        const jobId = await t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.sendInviteEmail,
                    status: "dead" as const,
                    attempt: 5,
                    maxAttempts: 5,
                    lastError: "Resend 422: invalid to address mario.rossi@example.com",
                    finishedAt: Date.now(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        let caught: unknown;
        try {
            await t.mutation(internal.jobs.retryDead, { jobId, reason: "  " });
        } catch (error) {
            caught = error;
        }
        expect((caught as { data?: { code?: string } }).data?.code).toBe("REASON_REQUIRED");

        expect(await t.mutation(internal.jobs.retryDead, { jobId, reason: "incident 42" })).toEqual({ retried: true });
        const audit = (await t.run(async (ctx) => ctx.db.query("auditLogs").collect())).find(
            (row) => row.action === "admin.job_retried",
        );
        expect(audit!.actorAppUserId).toBeUndefined();
        expect(audit!.details).toMatchObject({ reason: "incident 42", source: "deployment_cli", lastErrorCode: "HTTP_422" });
        // The provider text (with the address) is not copied into the audit.
        expect(JSON.stringify(audit!.details)).not.toContain("mario.rossi");
    });

    it("un tipo di job non registrato è un rifiuto, non una riga che nessuno consuma", async () => {
        const { t } = await bootstrap();

        let caught: unknown;
        try {
            await t.run(
                async (ctx) => await enqueueJob(ctx as never, { type: "email:welcome" }),
            );
        } catch (error) {
            caught = error;
        }

        expect((caught as { data?: { code?: string } }).data?.code).toBe("JOB_TYPE_UNKNOWN");
        expect(await jobRows(t)).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// send-invite-email
// ---------------------------------------------------------------------------

describe("send-invite-email", () => {
    it("sostituisce i placeholder, usa il mittente eventi e registra la riga seed", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            title: "Matrimonio di prova",
            slug: "matrimonio-di-prova",
            distribution: {
                emailSubject: "Ciao {nome}!",
                emailBody: "Apri qui: {link}",
            },
        });
        const guestId = await seedGuest(fixture, eventId, { firstName: "Ada" });

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendInviteEmail,
            payload: { guestId },
        });

        expect(status).toBe("succeeded");
        const sent = emailCalls();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload.subject).toBe("Ciao Ada!");
        expect(sent[0]!.payload.from).toBe("Ceremly <inviti@events.ceremly.test>");
        expect(sent[0]!.payload.to).toEqual(["ada@example.com"]);

        // Il link è quello del legacy: `{SITE_URL}/e/{slug}/{token}`.
        expect(sent[0]!.payload.text).toContain(`${SITE_URL}/e/matrimonio-di-prova/tok0000001`);
        expect(sent[0]!.payload.text).toContain("Apri qui: ");

        // La riga seed è ciò che permette al webhook di risalire all'ospite.
        const events = await rows(fixture.t, "emailEvents");
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: "sent",
            messageId: "msg_under_test",
            emailType: "guest-invite",
            guestId,
            eventId,
            organizationId: fixture.organizationId,
        });
        expect(await auditActions(fixture.t)).toContain("email.sent");
    });

    it("salta senza inviare un ospite rimosso o senza email — e il job riesce", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "senza-email" });
        const removed = await seedGuest(fixture, eventId, {
            removedAt: Date.now(),
            token: "tok0000002",
        });
        const withoutEmail = await seedGuest(fixture, eventId, {
            email: null,
            token: "tok0000003",
        });

        const first = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendInviteEmail,
            payload: { guestId: removed },
        });
        const second = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendInviteEmail,
            payload: { guestId: withoutEmail },
        });

        expect(first).toBe("succeeded");
        expect(second).toBe("succeeded");
        expect(emailCalls()).toHaveLength(0);
        expect(await rows(fixture.t, "emailEvents")).toHaveLength(0);
    });

    it("un 429 di Resend non è un successo: il job va in retrying con l'errore del provider", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "rate-limited" });
        const guestId = await seedGuest(fixture, eventId);

        resendResponder = () => ({ status: 429, body: { message: "Too many requests" } });

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendInviteEmail,
            payload: { guestId },
        });

        expect(status).toBe("retrying");
        const job = (await jobRows(fixture.t))[0]!;
        expect(job.lastError).toContain("RESEND_429");
        // Nessuna riga seed: l'email non è partita, e dirlo sarebbe una bugia.
        expect(await rows(fixture.t, "emailEvents")).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// send-reminder-email
// ---------------------------------------------------------------------------

describe("send-reminder-email", () => {
    it("invia il reminder e scrive l'attività `reminder_sent` solo dopo il successo", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "reminder-ok" });
        const guestId = await seedGuest(fixture, eventId, { firstName: "Ada" });
        const reminderId = await seedReminder(fixture, eventId);

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendReminderEmail,
            payload: { guestId, reminderId },
        });

        expect(status).toBe("succeeded");
        expect(emailCalls()[0]!.payload.subject).toBe("Promemoria per Ada");
        expect(emailCalls()[0]!.headers["idempotency-key"]).toBe(
            `reminder/${reminderId}/guest/${guestId}`,
        );

        const activities = await rows(fixture.t, "guestActivities");
        expect(activities).toHaveLength(1);
        expect(activities[0]).toMatchObject({ type: "reminder_sent", reminderId, guestId });
    });

    it("non sollecita chi ha già risposto, chi ha i reminder spenti o un ospite rimosso", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "reminder-guards" });
        const reminderId = await seedReminder(fixture, eventId);

        const answered = await seedGuest(fixture, eventId, { token: "tok0000010" });
        const disabled = await seedGuest(fixture, eventId, {
            token: "tok0000011",
            remindersDisabled: true,
        });
        const removed = await seedGuest(fixture, eventId, {
            token: "tok0000012",
            removedAt: Date.now(),
        });

        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("rsvpResponses", {
                    organizationId: fixture.organizationId,
                    eventId,
                    guestId: answered,
                    attending: "yes" as const,
                    companionsCount: 0,
                    answers: {},
                    submittedAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        for (const guestId of [answered, disabled, removed]) {
            await enqueueAndRun(fixture.t, {
                type: JOB_TYPES.sendReminderEmail,
                payload: { guestId, reminderId },
            });
        }

        expect(emailCalls()).toHaveLength(0);
        expect(await rows(fixture.t, "guestActivities")).toHaveLength(0);
    });

    it("un reminder di un altro evento è un rifiuto silenzioso, non un invio sbagliato", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "reminder-a" });
        const otherEvent = await seedEvent(fixture, { slug: "reminder-b" });
        const guestId = await seedGuest(fixture, eventId);
        const foreignReminder = await seedReminder(fixture, otherEvent);

        await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendReminderEmail,
            payload: { guestId, reminderId: foreignReminder },
        });

        expect(emailCalls()).toHaveLength(0);
    });

    it("la chiave (guestId, reminderId) rende l'attività idempotente, come il vincolo del legacy", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "reminder-idem" });
        const guestId = await seedGuest(fixture, eventId);
        const reminderId = await seedReminder(fixture, eventId);

        const first = await fixture.t.mutation(internal.jobs.recordReminderActivity, {
            guestId,
            reminderId,
        });
        const second = await fixture.t.mutation(internal.jobs.recordReminderActivity, {
            guestId,
            reminderId,
        });

        expect(first.recorded).toBe(true);
        expect(second.recorded).toBe(false);
        expect(await rows(fixture.t, "guestActivities")).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// image-variant
// ---------------------------------------------------------------------------

describe("image-variant", () => {
    it("riprende un originale in attesa e chiama il bridge media una volta sola", async () => {
        const fixture = await bootstrap();
        const fileId = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("files", {
                    organizationId: fixture.organizationId,
                    uploadedBy: fixture.appUserId,
                    originalName: "invito.png",
                    mimeType: "image/png",
                    fileType: "image",
                    size: 1024,
                    path: "org/2026-09/abc/original.png",
                    basePath: "org/2026-09/abc",
                    isPublic: true,
                    isActive: true,
                    uploadStatus: "active" as const,
                    variantType: "original" as const,
                    variantStatus: "pending" as const,
                    variantAttempts: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        bridgeResponder = () => ({ status: 200, body: { ok: true } });

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.imageVariant,
            payload: { fileId },
        });

        expect(status).toBe("succeeded");
        const media = fetchCalls.filter((call) => call.url.includes("/api/internal/media/process"));
        expect(media).toHaveLength(1);
        expect(media[0]!.payload).toMatchObject({ fileId, key: "org/2026-09/abc/original.png" });

        const file = await fixture.t.run(async (ctx) => await ctx.db.get(fileId));
        expect(file!.variantStatus).toBe("processing");

        // Un secondo giro non riparte: `startProcessing` rifiuta un file già in
        // lavorazione, e il job lo riporta come `none` (non un errore da ritentare).
        const again = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.imageVariant,
            payload: { fileId },
        });
        expect(again).toBe("succeeded");
        expect(
            fetchCalls.filter((call) => call.url.includes("/api/internal/media/process")),
        ).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// event-cleanup-warning
// ---------------------------------------------------------------------------

describe("event-cleanup-warning", () => {
    it("avvisa l'owner e marca `cleanupWarnedAt` nella stessa transazione dell'audit", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "stale-warn", title: "Festa vecchia" });

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.eventCleanupWarning,
            payload: { eventId },
        });

        expect(status).toBe("succeeded");
        const sent = emailCalls();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload.to).toEqual(["alice@example.com"]);
        expect(sent[0]!.payload.subject).toContain("Festa vecchia");

        const event = await fixture.t.run(async (ctx) => await ctx.db.get(eventId));
        expect(event!.cleanupWarnedAt).toBeDefined();
        expect(await auditActions(fixture.t)).toContain("event.cleanup_warned");
    });

    it("non avvisa due volte lo stesso evento", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "stale-once" });

        await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.eventCleanupWarning,
            payload: { eventId },
        });
        const warnedAt = (await fixture.t.run(async (ctx) => await ctx.db.get(eventId)))!
            .cleanupWarnedAt;

        await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.eventCleanupWarning,
            payload: { eventId },
        });

        expect(emailCalls()).toHaveLength(1);
        const after = await fixture.t.run(async (ctx) => await ctx.db.get(eventId));
        // Il timestamp non si riscrive: è la base temporale della fase di delete.
        expect(after!.cleanupWarnedAt).toBe(warnedAt);
    });
});

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

describe("cron", () => {
    it("send-due-reminders accoda un job per ospite pendente e marca il reminder", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            slug: "cron-reminders",
            rsvpDeadline: Date.now() + 2 * 24 * 60 * 60 * 1000,
        });
        const reminderId = await seedReminder(fixture, eventId, 3);
        await seedGuest(fixture, eventId, { token: "tok0000020" });
        await seedGuest(fixture, eventId, { token: "tok0000021" });

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronSendDueReminders, {}));

        expect(result).toMatchObject({ processed: 1, queued: 2, skipped: 0 });

        const reminder = await fixture.t.run(async (ctx) => await ctx.db.get(reminderId));
        expect(reminder!.sentAt).toBeDefined();
        // `pending: false` è ciò che tiene il reminder fuori dall'indice del giro dopo.
        expect(reminder!.pending).toBe(false);
        expect(reminder!.processingAt).toBeUndefined();

        const jobs = await jobRows(fixture.t);
        expect(jobs).toHaveLength(2);
        expect(jobs.every((job) => job.name === JOB_TYPES.sendReminderEmail)).toBe(true);

        // I job girano davvero: due invii, due attività.
        await drain(fixture.t);
        expect(emailCalls()).toHaveLength(2);
        expect(await rows(fixture.t, "guestActivities")).toHaveLength(2);
    });

    it("un reminder con deadline passata non è dovuto: il form è chiuso", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            slug: "cron-closed",
            rsvpDeadline: Date.now() - 1000,
        });
        await seedReminder(fixture, eventId, 3);
        await seedGuest(fixture, eventId);

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronSendDueReminders, {}));

        expect(result.processed).toBe(0);
        expect(await jobRows(fixture.t)).toHaveLength(0);
    });

    it("requeue-image-variants accoda solo gli originali immagine in attesa", async () => {
        const fixture = await bootstrap();
        const pending = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("files", {
                    organizationId: fixture.organizationId,
                    originalName: "invito.png",
                    mimeType: "image/png",
                    fileType: "image",
                    size: 1024,
                    path: "org/a/original.png",
                    basePath: "org/a",
                    isPublic: true,
                    isActive: true,
                    uploadStatus: "active" as const,
                    variantType: "original" as const,
                    variantStatus: "pending" as const,
                    variantAttempts: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );
        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("files", {
                    organizationId: fixture.organizationId,
                    originalName: "documento.pdf",
                    mimeType: "application/pdf",
                    fileType: "document",
                    size: 1024,
                    path: "org/b/original.pdf",
                    basePath: "org/b",
                    isPublic: true,
                    isActive: true,
                    uploadStatus: "active" as const,
                    variantType: "original" as const,
                    variantStatus: "pending" as const,
                    variantAttempts: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
        );

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronRequeueImageVariants, {}));

        expect(result).toMatchObject({ candidates: 1, queued: 1 });
        const jobs = await jobRows(fixture.t);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toMatchObject({ fileId: pending });

        // Un secondo giro non duplica: la chiave di dedup è l'id del file.
        const again = ranCron(await fixture.t.mutation(internal.jobs.cronRequeueImageVariants, {}));
        expect(again.queued).toBe(0);
        expect(await jobRows(fixture.t)).toHaveLength(1);
    });

    it("cleanup-stale-events avvisa i candidati e cancella a lotti quelli avvisati da 7 giorni", async () => {
        const fixture = await bootstrap();
        const now = Date.now();
        const longAgo = now - 60 * 24 * 60 * 60 * 1000;

        // Candidato alla fase warn: concluso e inattivo da 60 giorni.
        const toWarn = await seedEvent(fixture, {
            slug: "stale-warn-candidate",
            status: "closed",
            eventDate: longAgo,
            updatedAt: longAgo,
        });
        // Candidato alla fase delete: avvisato 8 giorni fa.
        const toDelete = await seedEvent(fixture, {
            slug: "stale-delete-candidate",
            status: "closed",
            eventDate: longAgo,
            updatedAt: longAgo,
            cleanupWarnedAt: now - 8 * 24 * 60 * 60 * 1000,
        });
        const guestId = await seedGuest(fixture, toDelete, { token: "tok0000030" });

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronCleanupStaleEvents, {}));

        expect(result.warned).toBe(1);
        expect(result.deleted).toBe(1);

        const warnedJob = (await jobRows(fixture.t)).find(
            (job) => job.name === JOB_TYPES.eventCleanupWarning,
        );
        expect(warnedJob!.payload).toMatchObject({ eventId: toWarn });

        // Cancellazione a cascata: i figli prima, poi l'evento (Convex non ha FK).
        expect(await fixture.t.run(async (ctx) => await ctx.db.get(toDelete))).toBeNull();
        expect(await fixture.t.run(async (ctx) => await ctx.db.get(guestId))).toBeNull();
        expect(await auditActions(fixture.t)).toContain("event.deleted");
    });

    it("un evento con attività recente non è stale, per quante condizioni soddisfi", async () => {
        const fixture = await bootstrap();
        const now = Date.now();
        const longAgo = now - 60 * 24 * 60 * 60 * 1000;

        const eventId = await seedEvent(fixture, {
            slug: "stale-but-alive",
            status: "closed",
            eventDate: longAgo,
            updatedAt: longAgo,
        });
        const guestId = await seedGuest(fixture, eventId);
        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("guestActivities", {
                    organizationId: fixture.organizationId,
                    eventId,
                    guestId,
                    type: "rsvp_submitted" as const,
                    meta: {},
                    createdAt: now - 1000,
                }),
        );

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronCleanupStaleEvents, {}));

        expect(result.warned).toBe(0);
        expect(result.deleted).toBe(0);
        expect(await jobRows(fixture.t)).toHaveLength(0);
    });

    it("recover-stalled-jobs rischedula i job dovuti e quelli con lease scaduto", async () => {
        const fixture = await bootstrap();
        const now = Date.now();

        const due = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.dataExport,
                    status: "retrying" as const,
                    attempt: 1,
                    maxAttempts: 3,
                    nextAttemptAt: now - 1000,
                    createdAt: now,
                    updatedAt: now,
                }),
        );
        // Lease ancora valido: è in volo, e non va toccato.
        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.dataExport,
                    status: "running" as const,
                    attempt: 1,
                    maxAttempts: 3,
                    leaseExpiresAt: now + 60_000,
                    createdAt: now,
                    updatedAt: now,
                }),
        );
        // Lease scaduto: l'esecuzione è morta a metà.
        const orphan = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.dataExport,
                    status: "running" as const,
                    attempt: 1,
                    maxAttempts: 3,
                    leaseExpiresAt: now - 1000,
                    createdAt: now,
                    updatedAt: now,
                }),
        );

        const result = ranCron(await fixture.t.mutation(internal.jobs.cronRecoverStalledJobs, {}));

        expect(result).toMatchObject({ rescheduled: 1, orphaned: 1 });

        // Le ri-consegne portano i job a un tentativo nuovo, davvero.
        await drain(fixture.t);
        const recovered = await fixture.t.run(async (ctx) => await ctx.db.get(due));
        const revived = await fixture.t.run(async (ctx) => await ctx.db.get(orphan));
        expect(recovered!.attempt).toBe(2);
        expect(revived!.attempt).toBe(2);
        expect(revived!.status).toBe("retrying");
    });

    it("cleanup-orphan-files rivendica con un lease e cancella la riga solo se l'oggetto è sparito", async () => {
        const fixture = await bootstrap();
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

        const orphan = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("files", {
                    organizationId: fixture.organizationId,
                    originalName: "orfano.png",
                    mimeType: "image/png",
                    fileType: "image",
                    size: 10,
                    path: "org/orfano.png",
                    basePath: "org",
                    isPublic: true,
                    isActive: true,
                    uploadStatus: "pending" as const,
                    presignExpiresAt: twoHoursAgo,
                    variantType: "original" as const,
                    variantStatus: "none" as const,
                    variantAttempts: 0,
                    createdAt: twoHoursAgo,
                    updatedAt: twoHoursAgo,
                }),
        );

        const result = ranCron(await fixture.t.action(internal.jobs.cronCleanupOrphanFiles, {}));

        expect(result).toMatchObject({ claimed: 1, deleted: 1, failed: 0 });
        expect(await fixture.t.run(async (ctx) => await ctx.db.get(orphan))).toBeNull();
        expect(
            fetchCalls.some((call) => call.payload.op === "delete" && call.payload.key === "org/orfano.png"),
        ).toBe(true);
    });

    it("se il delete su R2 fallisce la riga resta, e torna candidabile", async () => {
        const fixture = await bootstrap();
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

        const orphan = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("files", {
                    organizationId: fixture.organizationId,
                    originalName: "orfano.png",
                    mimeType: "image/png",
                    fileType: "image",
                    size: 10,
                    path: "org/orfano-2.png",
                    basePath: "org",
                    isPublic: true,
                    isActive: true,
                    uploadStatus: "pending" as const,
                    presignExpiresAt: twoHoursAgo,
                    variantType: "original" as const,
                    variantStatus: "none" as const,
                    variantAttempts: 0,
                    createdAt: twoHoursAgo,
                    updatedAt: twoHoursAgo,
                }),
        );

        bridgeResponder = () => ({ status: 500, body: { ok: false } });

        const result = ranCron(await fixture.t.action(internal.jobs.cronCleanupOrphanFiles, {}));

        expect(result).toMatchObject({ claimed: 1, deleted: 0, failed: 1 });

        const row = await fixture.t.run(async (ctx) => await ctx.db.get(orphan));
        expect(row).not.toBeNull();
        // Il riferimento all'oggetto non si perde, e la riga torna candidabile subito:
        // un R2 che non risponde non deve rallentare la pulizia di una grace period
        // per ogni tentativo.
        expect(row!.presignExpiresAt).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Webhook Resend
// ---------------------------------------------------------------------------

describe("resend webhook", () => {
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

    async function deliver(
        t: Test,
        body: Record<string, unknown>,
        options: { svixId?: string; signature?: string } = {},
    ): Promise<{ status: number; payload: Record<string, unknown> }> {
        const raw = JSON.stringify(body);
        const svixId = options.svixId ?? "msg_delivery_1";
        const timestamp = Math.floor(Date.now() / 1000);

        const signature =
            options.signature ??
            (await signSvixPayload({ secret, id: svixId, timestampSeconds: timestamp, payload: raw }));

        const response = await t.fetch("/resend/events", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "svix-id": svixId,
                "svix-timestamp": String(timestamp),
                "svix-signature": signature,
            },
            body: raw,
        });

        return { status: response.status, payload: (await response.json()) as Record<string, unknown> };
    }

    it("final review M4: 503 + Retry-After in maintenance-readonly and maintenance, nothing written", async () => {
        const { t } = await bootstrap();
        for (const mode of ["maintenance-readonly", "maintenance"] as const) {
            await t.mutation(internal.siteSettings.set, { mode, reason: "test" });
            const response = await deliver(t, {
                type: "email.delivered",
                data: { email_id: "m1", to: ["ada@example.com"] },
            });
            expect(response.status).toBe(503);
            expect(response.payload.code).toBe("SITE_READ_ONLY");
        }
        expect(await rows(t, "emailEvents")).toHaveLength(0);
        expect(await rows(t, "webhookEvents")).toHaveLength(0);
    });

    it("rifiuta una firma non valida con 401", async () => {
        const { t } = await bootstrap();

        const response = await deliver(
            t,
            { type: "email.delivered", data: { email_id: "m1", to: ["ada@example.com"] } },
            { signature: "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
        );

        expect(response.status).toBe(401);
        expect(response.payload.code).toBe("SIGNATURE_MISMATCH");
        expect(await rows(t, "emailEvents")).toHaveLength(0);
    });

    it("ingestisce un evento e non lo duplica al replay dello stesso svix-id", async () => {
        const { t } = await bootstrap();

        const event = {
            type: "email.delivered",
            created_at: new Date().toISOString(),
            data: {
                email_id: "m1",
                from: "Ceremly <inviti@events.ceremly.test>",
                to: ["ada@example.com"],
            },
        };

        const first = await deliver(t, event);
        const second = await deliver(t, event);

        expect(first.status).toBe(200);
        expect(first.payload.outcome).toBe("recorded");
        expect(second.payload).toMatchObject({ outcome: "duplicate", eventType: "delivered" });
        expect(await rows(t, "emailEvents")).toHaveLength(1);
    });

    it("un bounce scrive la soppressione, e un'apertura muove i contatori dell'ospite", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "webhook-contatori" });
        const guestId = await seedGuest(fixture, eventId, { token: "tok0000040" });

        // La riga seed è ciò che il webhook usa per risalire all'ospite.
        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("emailEvents", {
                    messageId: "m2",
                    type: "sent",
                    recipient: "ada@example.com",
                    emailType: "guest-invite",
                    organizationId: fixture.organizationId,
                    guestId,
                    eventId,
                    occurredAt: Date.now(),
                    createdAt: Date.now(),
                }),
        );

        const opened = await deliver(
            fixture.t,
            {
                type: "email.opened",
                created_at: new Date().toISOString(),
                data: {
                    email_id: "m2",
                    from: "Ceremly <inviti@events.ceremly.test>",
                    to: ["ada@example.com"],
                },
            },
            { svixId: "svix_open_1" },
        );

        expect(opened.payload.outcome).toBe("recorded");
        const guest = await fixture.t.run(async (ctx) => await ctx.db.get(guestId));
        expect(guest!.openCount).toBe(1);
        expect(guest!.firstOpenedAt).toBeDefined();
        expect(guest!.emailOpenedAt).toBeDefined();

        const bounced = await deliver(
            fixture.t,
            {
                type: "email.bounced",
                created_at: new Date().toISOString(),
                data: {
                    email_id: "m2",
                    from: "Ceremly <inviti@events.ceremly.test>",
                    to: ["ada@example.com"],
                    bounce: { subType: "Suppressed" },
                },
            },
            { svixId: "svix_bounce_1" },
        );

        expect(bounced.payload.outcome).toBe("recorded");
        const suppressions = await rows(fixture.t, "emailSuppressions");
        expect(suppressions).toHaveLength(1);
        expect(suppressions[0]).toMatchObject({
            email: "ada@example.com",
            reason: "hard_bounce",
            bounceSubtype: "Suppressed",
        });

        // Un secondo bounce dello stesso indirizzo non duplica la soppressione.
        await deliver(
            fixture.t,
            {
                type: "email.bounced",
                data: {
                    email_id: "m3",
                    from: "Ceremly <inviti@events.ceremly.test>",
                    to: ["ada@example.com"],
                },
            },
            { svixId: "svix_bounce_2" },
        );
        expect(await rows(fixture.t, "emailSuppressions")).toHaveLength(1);
    });

    it("un mittente di un altro ambiente viene ignorato, e non scrive nulla", async () => {
        const { t } = await bootstrap();

        const response = await deliver(t, {
            type: "email.delivered",
            data: {
                email_id: "m9",
                from: "Altro <noreply@altro-dominio.test>",
                to: ["ada@example.com"],
            },
        });

        expect(response.payload.skipped).toBe("foreign-domain");
        expect(await rows(t, "emailEvents")).toHaveLength(0);
    });

    it("un indirizzo soppresso non riceve email: l'invio è un audit, non un invio", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "soppresso" });
        const guestId = await seedGuest(fixture, eventId, { email: "bounce@example.com" });

        await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("emailSuppressions", {
                    email: "bounce@example.com",
                    reason: "hard_bounce",
                    source: "resend_webhook",
                    createdAt: Date.now(),
                }),
        );

        const status = await enqueueAndRun(fixture.t, {
            type: JOB_TYPES.sendInviteEmail,
            payload: { guestId },
        });

        expect(status).toBe("succeeded");
        expect(emailCalls()).toHaveLength(0);
        // Un invio non fatto non è un successo silenzioso: la riga di audit c'è.
        const audit = await rows(fixture.t, "auditLogs");
        expect(audit.some((row) => row.action === "email.failed")).toBe(true);
    });
});
