import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { eventFixture, initConvexTestWithAuthComponent } from "./test.setup";
import { JOB_TYPES } from "./lib/jobQueue";
import { signBridgeRequest } from "./lib/bridgeHmac";
import { hashClientIp } from "./lib/spam";
import { signPreviewToken, verifyPreviewToken } from "./lib/previewToken";

/**
 * Task 14 (part a) — the producers of `send-invite-email`, the test email and the
 * signed preview, characterized from the legacy `distribution.service.ts`
 * (`sendInvites`, `sendTest`) and `publicInvite.service.ts` (`getInvitePreview`).
 *
 * Until this task the job type had a consumer (Task 13) and no producer: the
 * organizer's "Invia" button still went through `POST /api/events/:id/send`. The
 * assertions below are the legacy contract — `{ queued, skippedNoEmail, failed }`,
 * closed event refused, draft activated, distribution merged, only active in-scope
 * guests, "Inviato" only for what was queued — plus the two rules the migration
 * adds: the job payload carries ids only, and a second click while a job is still
 * in flight does not queue a second email.
 *
 * `globalThis.fetch` records the Resend API, as in `jobs.test.ts`, so the queued
 * job can run for real through the scheduler.
 */

type Test = Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>;
type Session = ReturnType<Test["withIdentity"]>;

interface Fixture {
    t: Test;
    s: Session;
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
}

const RESEND_URL = "https://api.resend.com/emails";
const SITE_URL = "https://app.test";
const AUTH_SECRET = "better-auth-secret-under-test";

interface FetchCall {
    url: string;
    payload: Record<string, unknown>;
}

let fetchCalls: FetchCall[] = [];
let resendResponder: () => { status: number; body: unknown } = () => ({
    status: 200,
    body: { id: "msg_under_test" },
});

beforeEach(() => {
    fetchCalls = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resendResponder = () => ({ status: 200, body: { id: "msg_under_test" } });

    process.env.SITE_URL = SITE_URL;
    process.env.APP_NAME = "Ceremly";
    process.env.RESEND_API_KEY = "re_under_test";
    process.env.EMAIL_FROM = "Ceremly <noreply@ceremly.test>";
    process.env.EVENTS_EMAIL_FROM = "Ceremly <inviti@events.ceremly.test>";
    process.env.BETTER_AUTH_SECRET = AUTH_SECRET;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const body = typeof init?.body === "string" ? init.body : "{}";
        fetchCalls.push({ url: target, payload: JSON.parse(body) as Record<string, unknown> });
        const simulated = target.startsWith(RESEND_URL)
            ? resendResponder()
            : { status: 200, body: { ok: true } };
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

async function addUser(t: Test, email: string, name: string) {
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
    return { s, appUserId: provisioned.appUserId, organizationId: provisioned.organizationId };
}

async function bootstrap(): Promise<Fixture> {
    const t = await initConvexTestWithAuthComponent();
    register(t);
    const alice = await addUser(t, "alice@example.com", "Alice");
    return { t, ...alice };
}

const rows = <T extends TableNames>(t: Test, table: T): Promise<Doc<T>[]> =>
    t.run(async (ctx) => await ctx.db.query(table).collect());

async function seedEvent(
    fixture: Fixture,
    overrides: Partial<Omit<Doc<"events">, "_id" | "_creationTime" | "organizationId">> = {},
): Promise<Id<"events">> {
    return await fixture.t.run(
        async (ctx) =>
            await ctx.db.insert(
                "events",
                eventFixture(fixture.organizationId, { status: "active", ...overrides }),
            ),
    );
}

let tokenCounter = 0;

async function seedGuest(
    fixture: Fixture,
    eventId: Id<"events">,
    seed: { firstName?: string; email?: string | null; removedAt?: number; sentAt?: number } = {},
): Promise<Id<"guests">> {
    tokenCounter += 1;
    const now = Date.now();
    return await fixture.t.run(
        async (ctx) =>
            await ctx.db.insert("guests", {
                organizationId: fixture.organizationId,
                eventId,
                firstName: seed.firstName ?? "Ada",
                lastName: "Lovelace",
                ...(seed.email === null ? {} : { email: seed.email ?? `guest${tokenCounter}@example.com` }),
                token: `tok${String(tokenCounter).padStart(7, "0")}`,
                openCount: 0,
                remindersDisabled: false,
                ...(seed.removedAt === undefined ? {} : { removedAt: seed.removedAt }),
                ...(seed.sentAt === undefined ? {} : { sentAt: seed.sentAt, sentChannel: "whatsapp" as const }),
                createdAt: now,
                updatedAt: now,
            }),
    );
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}, but the call resolved`).toBeDefined();
    const data = (caught as { data?: { code?: unknown } }).data;
    expect(data?.code, `expected code ${code}, got ${JSON.stringify(data)}`).toBe(code);
}

async function drain(t: Test): Promise<void> {
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();
}

// ---------------------------------------------------------------------------
// guests.sendInvites — legacy POST /api/events/:id/send
// ---------------------------------------------------------------------------

describe("guests.sendInvites", () => {
    it("queues one ID-only job per active guest with an email and reports the legacy counts", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            status: "draft",
            distribution: { whatsappTemplate: "WA {nome}", senderName: "Giulia" },
        });
        const ada = await seedGuest(fixture, eventId, { firstName: "Ada" });
        const grace = await seedGuest(fixture, eventId, { firstName: "Grace" });
        const noEmail = await seedGuest(fixture, eventId, { email: null });

        const result = await fixture.s.mutation(api.guests.sendInvites, {
            eventId,
            guestIds: [ada, grace, noEmail],
            subject: "Ciao {nome}",
            body: "Apri {link}",
        });

        expect(result).toEqual({ queued: 2, skippedNoEmail: 1, failed: 0 });

        const jobs = await rows(fixture.t, "jobExecutions");
        expect(jobs).toHaveLength(2);
        for (const job of jobs) {
            expect(job.name).toBe(JOB_TYPES.sendInviteEmail);
            // ID-only payload: the subject and body live on the event, the job reads
            // them when it runs (legacy: "il job handler legge da lì").
            expect(Object.keys(job.payload ?? {})).toEqual(["guestId"]);
        }
        expect(jobs.map((job) => job.payload?.guestId).sort()).toEqual([ada, grace].sort());

        // Merge, not replace: the WhatsApp template and the sender survive.
        const event = await fixture.t.run(async (ctx) => await ctx.db.get(eventId));
        expect(event!.distribution).toEqual({
            whatsappTemplate: "WA {nome}",
            senderName: "Giulia",
            emailSubject: "Ciao {nome}",
            emailBody: "Apri {link}",
        });
        // The first send activates a draft: otherwise the links just sent would 404.
        expect(event!.status).toBe("active");

        const guests = await rows(fixture.t, "guests");
        const byId = new Map(guests.map((guest) => [guest._id, guest]));
        expect(byId.get(ada)!.sentChannel).toBe("email");
        expect(byId.get(ada)!.sentAt).toBeTypeOf("number");
        // A guest without an email is skipped, not marked.
        expect(byId.get(noEmail)!.sentAt).toBeUndefined();

        const activities = await rows(fixture.t, "guestActivities");
        expect(activities.map((a) => [a.guestId, a.type, a.meta]).sort()).toEqual(
            [
                [ada, "invite_sent", { channel: "email" }],
                [grace, "invite_sent", { channel: "email" }],
            ].sort(),
        );

        const audit = (await rows(fixture.t, "auditLogs")).filter((row) => row.action === "invite.sent");
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({
            actorAppUserId: fixture.appUserId,
            organizationId: fixture.organizationId,
            targetType: "event",
            targetId: eventId,
            details: { channel: "email", queued: 2, skippedNoEmail: 1, failed: 0 },
        });
    });

    it("delivers through the existing consumer, with the subject just saved", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "consegna-vera" });
        const ada = await seedGuest(fixture, eventId, { firstName: "Ada", email: "ada@example.com" });

        await fixture.s.mutation(api.guests.sendInvites, {
            eventId,
            guestIds: [ada],
            subject: "Per te, {nome}",
            body: "Il tuo invito: {link}",
        });
        await drain(fixture.t);

        const sent = emailCalls();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload.subject).toBe("Per te, Ada");
        expect(sent[0]!.payload.to).toEqual(["ada@example.com"]);
        expect(sent[0]!.payload.text).toContain(`${SITE_URL}/e/consegna-vera/`);
        expect((await rows(fixture.t, "jobExecutions"))[0]!.status).toBe("succeeded");
    });

    it("omits removed guests and guests of another event instead of failing", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const otherEventId = await seedEvent(fixture);
        const active = await seedGuest(fixture, eventId);
        const removed = await seedGuest(fixture, eventId, { removedAt: Date.now() });
        const elsewhere = await seedGuest(fixture, otherEventId);

        const result = await fixture.s.mutation(api.guests.sendInvites, {
            eventId,
            guestIds: [active, removed, elsewhere],
            subject: "Oggetto",
            body: "Corpo",
        });

        expect(result).toEqual({ queued: 1, skippedNoEmail: 0, failed: 0 });
        expect((await rows(fixture.t, "jobExecutions")).map((job) => job.payload?.guestId)).toEqual([active]);
    });

    it("refuses a closed event without queueing or saving anything", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { status: "closed", distribution: {} });
        const guestId = await seedGuest(fixture, eventId);

        await expectCode(
            fixture.s.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "Oggetto",
                body: "Corpo",
            }),
            "EVENT_CLOSED",
        );

        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(0);
        const event = await fixture.t.run(async (ctx) => await ctx.db.get(eventId));
        expect(event!.distribution).toEqual({});
    });

    it("does not queue a second email while the first job for that guest is still in flight", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const guestId = await seedGuest(fixture, eventId);

        const send = () =>
            fixture.s.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "Oggetto",
                body: "Corpo",
            });

        await send();
        const firstSentAt = (await fixture.t.run(async (ctx) => await ctx.db.get(guestId)))!.sentAt;
        const second = await send();

        // Still "queued" from the organizer's point of view: one email will leave.
        expect(second).toEqual({ queued: 1, skippedNoEmail: 0, failed: 0 });
        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(1);
        expect(await rows(fixture.t, "guestActivities")).toHaveLength(1);
        expect((await fixture.t.run(async (ctx) => await ctx.db.get(guestId)))!.sentAt).toBe(firstSentAt);

        // Once the job is done, sending again is a new, intentional invite.
        await drain(fixture.t);
        await send();
        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(2);
    });

    it("keeps the first sentAt when a guest already invited on WhatsApp is emailed", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const guestId = await seedGuest(fixture, eventId, { sentAt: 1_000 });

        await fixture.s.mutation(api.guests.sendInvites, {
            eventId,
            guestIds: [guestId],
            subject: "Oggetto",
            body: "Corpo",
        });

        const guest = await fixture.t.run(async (ctx) => await ctx.db.get(guestId));
        // Legacy `COALESCE(sent_at, now())`: the channel changes, the date does not.
        expect(guest!.sentAt).toBe(1_000);
        expect(guest!.sentChannel).toBe("email");
    });

    it("validates the input like the legacy schema (1–200 guests, subject ≤ 200, body ≤ 5000)", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const guestId = await seedGuest(fixture, eventId);

        await expectCode(
            fixture.s.mutation(api.guests.sendInvites, { eventId, guestIds: [], subject: "s", body: "b" }),
            "INVALID_INPUT",
        );
        await expectCode(
            fixture.s.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "x".repeat(201),
                body: "b",
            }),
            "INVALID_INPUT",
        );
        await expectCode(
            fixture.s.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "s",
                body: "   ",
            }),
            "INVALID_INPUT",
        );
        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(0);
    });

    it("makes another organization's event indistinguishable from a missing one", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const guestId = await seedGuest(fixture, eventId);
        const bob = await addUser(fixture.t, "bob@example.com", "Bob");

        await expectCode(
            bob.s.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "s",
                body: "b",
            }),
            "EVENT_NOT_FOUND",
        );
        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(0);
    });

    it("refuses an anonymous caller", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const guestId = await seedGuest(fixture, eventId);

        await expect(
            fixture.t.mutation(api.guests.sendInvites, {
                eventId,
                guestIds: [guestId],
                subject: "s",
                body: "b",
            }),
        ).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// guests.sendTest — legacy POST /api/events/:id/send-test
// ---------------------------------------------------------------------------

describe("guests.sendTest", () => {
    it("sends the invite to the caller, as Anna, with a signed preview link, writing nothing on the event", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            title: "Giulia & Tommaso",
            slug: "giulia-tommaso",
            distribution: { emailSubject: "Ciao {nome}", emailBody: "Guarda qui: {link}" },
        });
        const before = await fixture.t.run(async (ctx) => await ctx.db.get(eventId));

        const result = await fixture.s.action(api.guests.sendTest, { eventId });

        expect(result).toEqual({ success: true });
        const sent = emailCalls();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload.to).toEqual(["alice@example.com"]);
        expect(sent[0]!.payload.subject).toBe("Ciao Anna");
        // Legacy `type: "custom"`: the transactional sender, not the tracked one.
        expect(sent[0]!.payload.from).toBe("Ceremly <noreply@ceremly.test>");

        const text = String(sent[0]!.payload.text);
        const match = /\/e\/giulia-tommaso\/preview\?sig=([^\s)"]+)/.exec(text);
        expect(match, text).not.toBeNull();
        const sig = decodeURIComponent(match![1]!);
        expect(await verifyPreviewToken(AUTH_SECRET, "giulia-tommaso", sig)).toBe(true);

        // No domain write: event untouched, no guest, no job.
        expect(await fixture.t.run(async (ctx) => await ctx.db.get(eventId))).toEqual(before);
        expect(await rows(fixture.t, "guests")).toHaveLength(0);
        expect(await rows(fixture.t, "jobExecutions")).toHaveLength(0);

        const audit = (await rows(fixture.t, "auditLogs")).filter((row) => row.action === "invite.test_sent");
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({
            actorAppUserId: fixture.appUserId,
            organizationId: fixture.organizationId,
            targetId: eventId,
            status: "success",
        });
    });

    it("uses the override first, then the saved text, then the legacy defaults", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, {
            title: "Laurea di Ada",
            distribution: { emailSubject: "Salvato {nome}", emailBody: "Salvato {link}" },
        });
        const bare = await seedEvent(fixture, { title: "Evento spoglio", distribution: {} });

        await fixture.s.action(api.guests.sendTest, {
            eventId,
            subject: "Prova {nome}",
            body: "Bozza per {nome}",
        });
        await fixture.s.action(api.guests.sendTest, { eventId: bare });

        const [override, fallback] = emailCalls();
        expect(override!.payload.subject).toBe("Prova Anna");
        expect(String(override!.payload.text)).toContain("Bozza per Anna");
        // No saved subject: the legacy default subject of the invite template.
        expect(String(fallback!.payload.subject)).toContain("Evento spoglio");
        expect(String(fallback!.payload.text)).toContain("c'è un invito che ti aspetta");
    });

    it("reports a failed delivery instead of a success, and audits the failure", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        resendResponder = () => ({ status: 500, body: { message: "boom" } });

        await expectCode(fixture.s.action(api.guests.sendTest, { eventId }), "TEST_EMAIL_FAILED");

        const audit = (await rows(fixture.t, "auditLogs")).filter((row) => row.action === "invite.test_sent");
        expect(audit).toHaveLength(1);
        expect(audit[0]!.status).toBe("failure");
    });

    it("refuses another organization's event before sending anything", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture);
        const bob = await addUser(fixture.t, "bob@example.com", "Bob");

        await expectCode(bob.s.action(api.guests.sendTest, { eventId }), "EVENT_NOT_FOUND");
        expect(emailCalls()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// rsvp.previewInvite — legacy GET /api/public/preview
// ---------------------------------------------------------------------------

describe("rsvp.previewInvite", () => {
    it("signs exactly like the legacy `previewToken.ts`, so links already sent keep working", async () => {
        const sig = await signPreviewToken(AUTH_SECRET, "giulia-tommaso");
        const [exp, hmac] = sig.split(".");
        const legacy = createHmac("sha256", AUTH_SECRET)
            .update(`preview:giulia-tommaso:${exp}`)
            .digest("hex");

        expect(hmac).toBe(legacy);
        // 30 days, in seconds, like the legacy TTL.
        expect(Number(exp) - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1);
    });

    it("renders the event with the sample guest, no response and no tracking", async () => {
        const fixture = await bootstrap();
        const eventId = await seedEvent(fixture, { slug: "anteprima", title: "Anteprima", status: "draft" });
        const sig = await signPreviewToken(AUTH_SECRET, "anteprima");

        const payload = await fixture.t.query(api.rsvp.previewInvite, { slug: "anteprima", sig });

        expect(payload.preview).toBe(true);
        expect(payload.guest).toEqual({ firstName: "Anna", lastName: "" });
        expect(payload.response).toBeNull();
        expect(payload.event.title).toBe("Anteprima");
        expect(payload.deadlinePassed).toBe(false);
        // The payload is built field by field: no tenant id leaks.
        expect(JSON.stringify(payload)).not.toContain(fixture.organizationId);
        expect(JSON.stringify(payload)).not.toContain(eventId);
        expect(await rows(fixture.t, "guestActivities")).toHaveLength(0);
    });

    it("answers the same generic 404 for a bad, foreign, expired or missing signature", async () => {
        const fixture = await bootstrap();
        await seedEvent(fixture, { slug: "anteprima" });
        const forOther = await signPreviewToken(AUTH_SECRET, "altro-evento");
        const expiredExp = Math.floor(Date.now() / 1000) - 10;
        const expired = `${expiredExp}.${createHmac("sha256", AUTH_SECRET)
            .update(`preview:anteprima:${expiredExp}`)
            .digest("hex")}`;
        const wrongKey = await signPreviewToken("another-secret", "anteprima");

        for (const sig of ["", "garbage", forOther, expired, wrongKey]) {
            await expectCode(
                fixture.t.query(api.rsvp.previewInvite, { slug: "anteprima", sig }),
                "INVITE_NOT_FOUND",
            );
        }

        const orphan = await signPreviewToken(AUTH_SECRET, "slug-inesistente");
        await expectCode(
            fixture.t.query(api.rsvp.previewInvite, { slug: "slug-inesistente", sig: orphan }),
            "INVITE_NOT_FOUND",
        );
    });
});

// ---------------------------------------------------------------------------
// The RSVP bridge — statuses the invite page reads
// ---------------------------------------------------------------------------

describe("public RSVP over the bridge", () => {
    const secret = "public-forms-secret-under-test";

    beforeEach(() => {
        process.env.PUBLIC_FORMS_SECRET = secret;
    });

    afterEach(() => {
        delete process.env.PUBLIC_FORMS_SECRET;
    });

    async function post(t: Test, payload: Record<string, unknown>): Promise<Response> {
        const signed = await signBridgeRequest({
            secret,
            method: "POST",
            path: "/public/rsvp",
            payload: { ...payload, ipHash: await hashClientIp(secret, "203.0.113.7") },
        });
        return await t.fetch("/public/rsvp", { method: "POST", headers: signed.headers, body: signed.body });
    }

    /**
     * Before this task every domain refusal of `rsvp.submit` crossed the bridge as a
     * `500`: the errors carried no `status`, and `runPublicForm` defaults to 500. The
     * invite page branches on 410 (closed: disable the form) and 422 (show the
     * validation errors), so on the Convex path both degraded into "generic error".
     */
    it("keeps the legacy statuses: 404 unknown token, 410 closed, 422 invalid with the errors", async () => {
        const fixture = await bootstrap();
        const closed = await seedEvent(fixture, { status: "closed", rsvpClosedMessage: "Chiuso, grazie!" });
        const open = await seedEvent(fixture, {
            rsvpConfig: [
                {
                    id: "attendance",
                    type: "single",
                    label: "Ci sarai?",
                    required: true,
                    perPerson: false,
                    options: ["Sì", "No", "Forse"],
                },
                { id: "q_note", type: "text", label: "Una nota", required: true, perPerson: false },
            ],
        });
        const closedGuest = await seedGuest(fixture, closed);
        const openGuest = await seedGuest(fixture, open);
        const tokenOf = async (guestId: Id<"guests">) =>
            (await fixture.t.run(async (ctx) => await ctx.db.get(guestId)))!.token;

        const missing = await post(fixture.t, { token: "nessuno000", attending: "yes", companionsCount: 0, answers: {} });
        expect(missing.status).toBe(404);

        const refused = await post(fixture.t, {
            token: await tokenOf(closedGuest),
            attending: "yes",
            companionsCount: 0,
            answers: {},
        });
        expect(refused.status).toBe(410);
        expect((await refused.json()) as unknown).toMatchObject({ code: "RSVP_CLOSED", message: "Chiuso, grazie!" });

        const invalid = await post(fixture.t, {
            token: await tokenOf(openGuest),
            attending: "yes",
            companionsCount: 0,
            answers: {},
        });
        expect(invalid.status).toBe(422);
        const body = (await invalid.json()) as { code: string; errors?: unknown };
        expect(body.code).toBe("RSVP_INVALID");
        expect(Array.isArray(body.errors) && body.errors.length > 0).toBe(true);
    });
});
