import { describe, expect, it } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { initConvexTest } from "./test.setup";
import { getTemplatesByType } from "./lib/inviteTemplates";
import { RSVP_PRESETS } from "./lib/rsvpPresets";
import { resolveEventLimits } from "./lib/domain";
import { UI_LIST_LIMIT } from "./projects";

/**
 * Characterization tests for the tenant domain in Convex (plan Task 11).
 *
 * The plan's list, in order: "create/list/get/update/delete evento e progetto,
 * import guest con dedup email, soft-delete guest, invito pubblico via token, RSVP
 * upsert, deadline/closed message, statistiche, mark-sent, reminder massimo 3,
 * event tier lock e tenant isolation".
 *
 * The assertions come from the legacy services, not from the new code: a port that
 * behaves differently from `server/services/*.service.ts` is a migration bug, even
 * when the new behaviour looks nicer. Where a test *does* pin something new, the
 * comment says so and why.
 */

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;

interface FixtureUser {
    subject: string;
    email: string;
    name: string;
}

const alice: FixtureUser = { subject: "auth_alice", email: "alice@example.com", name: "Alice" };
const bob: FixtureUser = { subject: "auth_bob", email: "bob@example.com", name: "Bob" };

const session = (t: Test, user: FixtureUser): Session =>
    t.withIdentity({ subject: user.subject, email: user.email, name: user.name });

async function bootstrap(user: FixtureUser = alice) {
    const t = initConvexTest();
    // Il tier di un evento si risolve dal componente Creem: senza registrarlo,
    // ogni mutation di dominio fallisce con "Component creem is not registered".
    register(t);
    const s = session(t, user);
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});
    return { t, s, organizationId: provisioned.organizationId };
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

const MATRIMONIO_TEMPLATE = getTemplatesByType("matrimonio")[0]!.key;

/** Evento creato dal template, come fa il client (`useEvents.create`). */
async function createEvent(
    s: Session,
    overrides: Partial<{
        type: Doc<"events">["type"];
        templateKey: string;
        title: string;
        eventDate: number;
        eventTime: string;
    }> = {},
): Promise<Doc<"events">> {
    return await s.mutation(api.events.create, {
        input: {
            type: "matrimonio",
            templateKey: MATRIMONIO_TEMPLATE,
            title: "Giulia & Tommaso",
            ...overrides,
        },
    });
}

/** Ospite attivo con token, come lo crea l'organizzatore. */
async function createGuest(
    s: Session,
    eventId: Id<"events">,
    input: Partial<{ firstName: string; lastName: string; email: string; token?: string }> = {},
) {
    return await s.mutation(api.guests.create, {
        eventId,
        input: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            ...input,
        },
    });
}

const rows = <T extends TableNames>(t: Test, table: T): Promise<Doc<T>[]> =>
    t.run(async (c) => await c.db.query(table).collect());

const guestTokenOf = async (t: Test, guestId: Id<"guests">): Promise<string> =>
    t.run(async (c) => {
        const guest = await c.db.get(guestId);
        return guest!.token;
    });

/** Attiva un evento: l'invito e il RSVP esistono solo per un evento `active`. */
const activate = (s: Session, eventId: Id<"events">) =>
    s.mutation(api.events.update, { eventId, input: { status: "active" } });

/**
 * Una risposta "sì" valida per il preset matrimonio.
 *
 * `q_participation`, `companion_names` e `q_menu` sono obbligatori e — gli
 * ultimi due — per persona: il numero di menu e di nomi deve coincidere con
 * `companionsCount`, altrimenti la submission è invalida. Scritto una volta sola
 * perché ogni test che risponde "sì" deve rispettare la stessa regola.
 */
const yesAnswers = (companionsCount: number, menu = "Carne") => ({
    companionsCount,
    answers: {
        q_participation: ["Cerimonia"],
        ...(companionsCount > 0
            ? {
                  companion_names: {
                      companions: Array.from(
                          { length: companionsCount },
                          (_, index) => `Accompagnatore ${index + 1}`,
                      ),
                  },
              }
            : {}),
        q_menu: {
            self: menu,
            companions: Array.from({ length: companionsCount }, () => menu),
        },
    },
});

// ---------------------------------------------------------------------------
// Eventi
// ---------------------------------------------------------------------------

describe("events", () => {
    it("expands the template into blocks and applies the RSVP preset", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s, { eventDate: Date.UTC(2026, 8, 12), eventTime: "16:00" });

        expect(event.status).toBe("draft");
        expect(event.tier).toBe("free");
        expect(event.slug).toMatch(/^giulia-tommaso-[a-z0-9]{4}$/);

        // Il template matrimonio ha un blocco header: il titolo "Giulia & Tommaso"
        // diventa due nomi, la data italiana e l'ora richiesta entrano nei campi
        // display.
        const header = event.blocks.find((block) => block.type === "header");
        expect(header && header.type === "header" ? header.data.names : []).toEqual([
            "Giulia",
            "Tommaso",
        ]);
        expect(header && header.type === "header" ? header.data.timeText : "").toBe("16:00");

        // Invarianti di contenuto: header primo, rsvp ultimo.
        expect(event.blocks[0]?.type).toBe("header");
        expect(event.blocks[event.blocks.length - 1]?.type).toBe("rsvp");

        // La domanda di partecipazione è la prima, bloccata, con 3 opzioni.
        const attendance = event.rsvpConfig[0]!;
        expect(attendance.id).toBe("attendance");
        expect(attendance.locked).toBe(true);
        expect(attendance.options).toHaveLength(3);
        expect(event.rsvpClosedMessage).toContain("Le risposte a questo invito sono chiuse");
        expect(event.distribution.senderName).toBeTruthy();

        // ...e il preset è quello condiviso, non una copia con valori diversi.
        expect(event.rsvpConfig.map((q) => q.id)).toEqual(RSVP_PRESETS.matrimonio.map((q) => q.id));
    });

    it("refuses a template that belongs to another event type", async () => {
        const { s } = await bootstrap();

        await expectCode(
            s.mutation(api.events.create, {
                input: { type: "laurea", templateKey: MATRIMONIO_TEMPLATE, title: "Laurea" },
            }),
            "TEMPLATE_NOT_FOUND",
        );
    });

    it("gives a Free organization one active event at a time", async () => {
        const { s } = await bootstrap();
        await createEvent(s);

        await expectCode(createEvent(s, { title: "Secondo" }), "ACTIVE_EVENT_LIMIT_REACHED");

        // Un evento chiuso non occupa più lo slot.
        const first = await s.query(api.events.list, {
            paginationOpts: { numItems: 10, cursor: null },
        });
        await s.mutation(api.events.update, {
            eventId: first.page[0]!._id,
            input: { status: "closed" },
        });

        const second = await createEvent(s, { title: "Secondo" });
        expect(second.title).toBe("Secondo");
    });

    it("enforces the block and RSVP invariants on update", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);

        // Un blocco RSVP in mezzo ai blocchi non è un invito valido.
        const withoutRsvpLast = event.blocks.filter(
            (block) => block.type !== "rsvp" && block.type !== "header",
        );
        await expectCode(
            s.mutation(api.events.update, {
                eventId: event._id,
                input: {
                    blocks: [
                        { id: "b_header", type: "header", data: { eyebrow: "", intro: "", names: ["A"], dateText: "", timeText: "" } },
                        ...withoutRsvpLast,
                        { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Confermo" } },
                        { id: "b_rsvp2", type: "rsvp", data: { buttonLabel: "Confermo" } },
                    ],
                },
            }),
            "INVITE_CONTENT_INVALID",
        );

        await expectCode(
            s.mutation(api.events.update, {
                eventId: event._id,
                input: {
                    rsvpConfig: [
                        {
                            id: "menu",
                            label: "Menu",
                            type: "single",
                            options: ["A", "B"],
                            required: true,
                            perPerson: false,
                        },
                    ],
                },
            }),
            "INVITE_CONTENT_INVALID",
        );
    });

    it("clears a nullable field on explicit null and rewrites cleanupWarnedAt", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        await t.run(async (c) => {
            await c.db.patch(event._id, { cleanupWarnedAt: 1, theme: { paper: "#FFF", accent: "#000", deep: "#111", onAccent: "#222" } });
        });

        const updated = await s.mutation(api.events.update, {
            eventId: event._id,
            input: { theme: null, locationName: "Villa" },
        });

        // `null` significa "azzera", non "ignora": il campo sparisce.
        expect(updated.theme).toBeUndefined();
        expect(updated.locationName).toBe("Villa");
        // FIX 7.4: un update dell'organizzatore riapre la finestra di avviso.
        expect(updated.cleanupWarnedAt).toBeUndefined();
    });

    it("cascades the delete over the whole event graph", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        await activate(s, event._id);
        await s.mutation(api.rsvp.submit, {
            token: await guestTokenOf(t, guest!._id),
            attending: "no",
            companionsCount: 0,
            answers: {},
            declineMessage: "Non posso",
        });
        await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [{ daysBefore: 7, subject: "Promemoria", message: "Ciao {nome}", enabled: true }],
        });

        await s.mutation(api.events.remove, { eventId: event._id });

        expect(await rows(t, "events")).toHaveLength(0);
        expect(await rows(t, "guests")).toHaveLength(0);
        expect(await rows(t, "rsvpResponses")).toHaveLength(0);
        expect(await rows(t, "guestActivities")).toHaveLength(0);
        expect(await rows(t, "eventReminders")).toHaveLength(0);
    });

    it("lists events newest first with the derived counts", async () => {
        const { t, s } = await bootstrap();
        const first = await createEvent(s, { title: "Primo" });
        const guest = await createGuest(s, first._id);
        await activate(s, first._id);
        await s.mutation(api.rsvp.submit, {
            token: await guestTokenOf(t, guest!._id),
            attending: "yes",
            ...yesAnswers(2),
        });
        await createGuest(s, first._id, { email: "second@example.com", firstName: "Alan" });
        await s.mutation(api.events.update, { eventId: first._id, input: { status: "closed" } });
        const second = await createEvent(s, { title: "Secondo" });

        // `createdAt` è la chiave dell'indice: dentro un test i due eventi nascono
        // nello stesso millisecondo, quindi l'ordine si fissa esplicitamente
        // invece di dipendere dal clock.
        await t.run(async (c) => {
            await c.db.patch(first._id, { createdAt: 1 });
            await c.db.patch(second._id, { createdAt: 2 });
        });

        const page = await s.query(api.events.list, {
            paginationOpts: { numItems: 10, cursor: null },
        });

        expect(page.page.map((event) => event.title)).toEqual(["Secondo", "Primo"]);
        const listed = page.page.find((event) => event._id === first._id)!;
        expect(listed.counts).toEqual({
            guests: 2,
            confirmed: 1,
            declined: 0,
            maybe: 0,
            // "In attesa" = senza risposta: il confermato non è pending.
            pending: 1,
            opened: 0,
            sent: 0,
        });
        // L'evento appena creato non ha ospiti: il tally è zero, non assente.
        expect(page.page.find((event) => event._id === second._id)!.counts.guests).toBe(0);
    });

    it("resolves the tier from the event, and Atelier from the organization", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        const free = await t.run(
            async (c) => await resolveEventLimits(c, { organizationId: event.organizationId, tier: "free" }),
        );
        expect(free).toMatchObject({ tier: "free", maxGuestsPerEvent: 30, maxReminders: 3 });

        const celebration = await t.run(
            async (c) =>
                await resolveEventLimits(c, { organizationId: event.organizationId, tier: "celebration" }),
        );
        expect(celebration).toMatchObject({ tier: "celebration", maxGuestsPerEvent: 250 });

        // Nessuna subscription Creem registrata in questo ambiente: il fail-safe è
        // `free`, mai "illimitato per assenza di dati".
        expect(free.unlimited).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Isolamento tenant
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
    it("makes another organization's event indistinguishable from a missing one", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});

        await expectCode(bobSession.query(api.events.get, { eventId: event._id }), "EVENT_NOT_FOUND");
        await expectCode(
            bobSession.mutation(api.events.update, { eventId: event._id, input: { title: "Rubato" } }),
            "EVENT_NOT_FOUND",
        );
        await expectCode(
            bobSession.query(api.events.stats, { eventId: event._id }),
            "EVENT_NOT_FOUND",
        );
        await expectCode(
            bobSession.query(api.guests.list, { eventId: event._id }),
            "EVENT_NOT_FOUND",
        );
        await expectCode(
            bobSession.mutation(api.events.remove, { eventId: event._id }),
            "EVENT_NOT_FOUND",
        );

        // ...e l'evento è ancora lì, intatto.
        expect((await s.query(api.events.get, { eventId: event._id })).title).toBe(
            "Giulia & Tommaso",
        );
    });

    it("does not let a foreign guest be reached through a foreign event", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);

        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});
        const bobEvent = await bobSession.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Suo" },
        });

        // Id veri, ma combinati: l'ospite esiste e l'evento è di Bob.
        await expectCode(
            bobSession.query(api.guests.get, { eventId: bobEvent._id, guestId: guest!._id }),
            "GUEST_NOT_FOUND",
        );
        void t;
    });

    it("scopes the project list to the active organization", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.projects.create, { input: { name: "Mio" } });

        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});
        await bobSession.mutation(api.projects.create, { input: { name: "Suo" } });

        const mine = await s.query(api.projects.list, {
            paginationOpts: { numItems: 10, cursor: null },
        });
        const theirs = await bobSession.query(api.projects.list, {
            paginationOpts: { numItems: 10, cursor: null },
        });

        expect(mine.page.map((project) => project.name)).toEqual(["Mio"]);
        expect(theirs.page.map((project) => project.name)).toEqual(["Suo"]);
    });
});

// ---------------------------------------------------------------------------
// Ospiti
// ---------------------------------------------------------------------------

describe("guests", () => {
    it("creates a guest with a token the legacy format accepts", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);

        const guest = await createGuest(s, event._id, { email: "  Ada@Example.COM " });

        expect(guest!.token).toMatch(/^[A-Za-z0-9]{10}$/);
        // L'email è la chiave di unicità: memorizzata normalizzata, come il
        // vincolo `lower(email)` del legacy la confrontava.
        expect(guest!.email).toBe("ada@example.com");
        expect(guest!.remindersDisabled).toBe(false);
    });

    it("refuses a second active guest with the same email", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);
        await createGuest(s, event._id, { email: "ada@example.com" });

        await expectCode(
            createGuest(s, event._id, { email: "ADA@example.com", firstName: "Altra" }),
            "GUEST_EMAIL_TAKEN",
        );
    });

    it("allows the email again once the first guest is removed", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id, { email: "ada@example.com" });
        await s.mutation(api.guests.softDelete, { eventId: event._id, guestId: guest!._id });

        const replacement = await createGuest(s, event._id, {
            email: "ada@example.com",
            firstName: "Altra",
        });
        expect(replacement!.email).toBe("ada@example.com");
    });

    it("enforces the Free guest limit", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        await t.run(async (c) => {
            for (let index = 0; index < 30; index += 1) {
                await c.db.insert("guests", {
                    organizationId: event.organizationId,
                    eventId: event._id,
                    firstName: `Guest${index}`,
                    lastName: "Test",
                    token: `token${index.toString().padStart(5, "0")}`,
                    openCount: 0,
                    remindersDisabled: false,
                    createdAt: index,
                    updatedAt: index,
                });
            }
        });

        await expectCode(createGuest(s, event._id, { email: "nuovo@example.com" }), "GUEST_LIMIT_REACHED");
    });

    it("derives the status, keeps the token immutable and clears the email", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        const token = guest!.token;
        await activate(s, event._id);

        await s.mutation(api.rsvp.submit, {
            token,
            attending: "yes",
            ...yesAnswers(3),
        });

        const list = await s.query(api.guests.list, { eventId: event._id });
        const listed = list.guests[0]!;
        expect(listed.rsvpStatus).toBe("confirmed");
        expect(listed.totalPeople).toBe(4);
        expect(list.summary).toMatchObject({ total: 1, confirmed: 1, pending: 0, removed: 0 });

        const updated = await s.mutation(api.guests.update, {
            eventId: event._id,
            guestId: guest!._id,
            input: { email: "", notes: "Tavolo 3" },
        });
        expect(updated!.email).toBeUndefined();
        expect(updated!.notes).toBe("Tavolo 3");
        expect(updated!.token).toBe(token);
        void t;
    });

    it("soft-deletes: the link dies, the response survives", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        const token = guest!.token;
        await activate(s, event._id);
        await s.mutation(api.rsvp.submit, { token, attending: "yes", ...yesAnswers(0) });

        await s.mutation(api.guests.softDelete, { eventId: event._id, guestId: guest!._id });

        // L'invito non è più raggiungibile...
        await expectCode(s.mutation(api.rsvp.publicInvite, { token }), "INVITE_NOT_FOUND");
        // ...ma la risposta resta nel database (PRD edge case).
        expect(await rows(t, "rsvpResponses")).toHaveLength(1);

        const list = await s.query(api.guests.list, { eventId: event._id });
        expect(list.summary).toMatchObject({ total: 0, removed: 1 });

        const stats = await s.query(api.events.stats, { eventId: event._id });
        expect(stats.kpi.totalGuests).toBe(0);
    });

    it("imports rows, skipping duplicate emails and warning on duplicate names", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);
        await createGuest(s, event._id, { firstName: "Marco", lastName: "Rossi", email: "marco@example.com" });

        const result = await s.mutation(api.guests.importRows, {
            eventId: event._id,
            rows: [
                { firstName: "Marco", lastName: "Rossi", email: "marco@example.com" },
                { firstName: "Marco", lastName: "Rossi", email: "altro@example.com" },
                { firstName: "Luca", lastName: "Bianchi", email: "luca@example.com" },
                { firstName: "Sara", lastName: "Verdi", email: "luca@example.com" },
                { firstName: "Senza", lastName: "Email", email: "" },
            ],
        });

        // Riga 1: email già presente → skip. Riga 4: email ripetuta nel file → skip.
        expect(result.imported).toBe(3);
        expect(result.skipped.map((issue) => issue.row)).toEqual([1, 4]);
        // Riga 2: stesso nome di un ospite esistente → importata con warning.
        expect(result.warnings.map((issue) => issue.row)).toEqual([2]);

        const list = await s.query(api.guests.list, { eventId: event._id });
        expect(list.summary.total).toBe(4);
        expect(list.guests.filter((guest) => guest.email === undefined)).toHaveLength(1);
    });

    it("marks invites as sent on WhatsApp and activates a draft", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);

        const result = await s.mutation(api.guests.markSent, {
            eventId: event._id,
            guestIds: [guest!._id],
        });

        expect(result.marked).toBe(1);
        const after = await s.query(api.events.get, { eventId: event._id });
        expect(after.status).toBe("active");

        const listed = (await s.query(api.guests.list, { eventId: event._id })).guests[0]!;
        expect(listed.sentChannel).toBe("whatsapp");
        expect(listed.sentAt).toBeTypeOf("number");

        const activities = await rows<"guestActivities">(t, "guestActivities");
        expect(activities.map((activity) => activity.type)).toEqual(["invite_sent"]);
        expect(activities[0]!.meta).toEqual({ channel: "whatsapp" });
    });

    it("keeps the first sent timestamp when an invite is re-marked", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);

        const first = await s.mutation(api.guests.markSent, {
            eventId: event._id,
            guestIds: [guest!._id],
        });
        expect(first.marked).toBe(1);
        expect((await t.run(async (c) => await c.db.get(guest!._id)))!.sentAt).toBeTypeOf(
            "number",
        );

        // Secondo invio dello stesso ospite: il legacy fa `COALESCE(sent_at, now())`,
        // quindi la data resta quella del primo invio. Il valore è un sentinella
        // e non `now()`, perché due mutation nello stesso millisecondo darebbero
        // lo stesso `Date.now()` e il test passerebbe anche con il bug.
        await t.run(async (c) => {
            await c.db.patch(guest!._id, { sentAt: 111, updatedAt: 0 });
        });
        const second = await s.mutation(api.guests.markSent, {
            eventId: event._id,
            guestIds: [guest!._id],
        });

        expect(second.marked).toBe(1);
        const after = await t.run(async (c) => await c.db.get(guest!._id));
        expect(after!.sentAt).toBe(111);
        expect(after!.updatedAt).not.toBe(0);

        // Un'attività per ogni marcatura: è il legacy a comportarsi così (il
        // filtro "già inviato" esiste sulla data, non sulla traccia).
        const activities = await rows<"guestActivities">(t, "guestActivities");
        expect(activities).toHaveLength(2);
    });

    it("refuses mark-sent on a closed event", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        await s.mutation(api.events.update, { eventId: event._id, input: { status: "closed" } });

        await expectCode(
            s.mutation(api.guests.markSent, { eventId: event._id, guestIds: [guest!._id] }),
            "EVENT_CLOSED",
        );
    });
});

// ---------------------------------------------------------------------------
// Invito pubblico e RSVP
// ---------------------------------------------------------------------------

describe("public invite", () => {
    it("gives the same 404 for an unknown token, a removed guest and a draft event", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        const token = guest!.token;

        // Bozza: l'invito non esiste ancora per l'ospite.
        await expectCode(s.mutation(api.rsvp.publicInvite, { token }), "INVITE_NOT_FOUND");

        await s.mutation(api.events.update, { eventId: event._id, input: { status: "active" } });
        await expectCode(
            s.mutation(api.rsvp.publicInvite, { token: "inesistente0" }),
            "INVITE_NOT_FOUND",
        );

        await s.mutation(api.guests.softDelete, { eventId: event._id, guestId: guest!._id });
        await expectCode(s.mutation(api.rsvp.publicInvite, { token }), "INVITE_NOT_FOUND");
        void t;
    });

    it("returns only the public fields, and counts the open", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id, { email: "ada@example.com" });
        await s.mutation(api.events.update, { eventId: event._id, input: { status: "active" } });

        const first = await s.mutation(api.rsvp.publicInvite, { token: guest!.token });
        const second = await s.mutation(api.rsvp.publicInvite, { token: guest!.token });

        expect(first.guest).toEqual({ firstName: "Ada", lastName: "Lovelace" });
        expect(second.deadlinePassed).toBe(false);

        // Il payload è costruito campo per campo: niente organizationId, email,
        // note, token o id interni.
        const serialized = JSON.stringify(first);
        expect(serialized).not.toContain(event.organizationId);
        expect(serialized).not.toContain("ada@example.com");
        expect(serialized).not.toContain(guest!.token);
        expect(Object.keys(first.event)).not.toContain("organizationId");

        const stored = await t.run(async (c) => await c.db.get(guest!._id));
        expect(stored!.openCount).toBe(2);
        expect(stored!.firstOpenedAt).toBeTypeOf("number");

        const activities = await rows<"guestActivities">(t, "guestActivities");
        expect(activities.map((activity) => activity.type)).toEqual(["link_opened", "link_opened"]);
        expect(activities.map((activity) => activity.meta)).toEqual([{ nth: 1 }, { nth: 2 }]);
    });

    it("keeps the invite visible but closes the form on deadline and on closed", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);

        await s.mutation(api.events.update, {
            eventId: event._id,
            input: { status: "active", rsvpDeadline: Date.now() - 1000 },
        });

        const invite = await s.mutation(api.rsvp.publicInvite, { token: guest!.token });
        expect(invite.deadlinePassed).toBe(true);

        await expectCode(
            s.mutation(api.rsvp.submit, {
                token: guest!.token,
                attending: "yes",
                companionsCount: 0,
                answers: {},
            }),
            "RSVP_CLOSED",
        );

        // Evento chiuso: stesso esito, con il messaggio configurato.
        await s.mutation(api.events.update, {
            eventId: event._id,
            input: { status: "closed", rsvpDeadline: null, rsvpClosedMessage: "Chiuso, scrivici." },
        });
        const closed = await s
            .mutation(api.rsvp.publicInvite, { token: guest!.token })
            .then(() => null)
            .catch((error: { data?: { rsvpClosedMessage?: string } }) => error);
        void closed;

        const inviteAfter = await s.mutation(api.rsvp.publicInvite, { token: guest!.token });
        expect(inviteAfter.deadlinePassed).toBe(true);
        expect(inviteAfter.event.rsvpClosedMessage).toBe("Chiuso, scrivici.");
        void t;
    });
});

describe("rsvp submission", () => {
    async function readyEvent(overrides: { rsvpConfig?: unknown } = {}) {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        await s.mutation(api.events.update, { eventId: event._id, input: { status: "active" } });
        if (overrides.rsvpConfig) {
            await s.mutation(api.events.update, {
                eventId: event._id,
                input: { rsvpConfig: overrides.rsvpConfig as never },
            });
        }
        return { t, s, event, guest: guest!, token: guest!.token };
    }

    it("upserts: the first submission creates, the second updates", async () => {
        const { t, s, token } = await readyEvent();

        const first = await s.mutation(api.rsvp.submit, {
            token,
            attending: "no",
            companionsCount: 0,
            answers: {},
            declineMessage: "  Non posso, grazie.  ",
        });
        const second = await s.mutation(api.rsvp.submit, {
            token,
            attending: "maybe",
            companionsCount: 1,
            answers: {},
        });

        expect(first.response?.declineMessage).toBe("Non posso, grazie.");
        // Cambiando risposta il messaggio di declino sparisce: `null` non ha un
        // equivalente in Convex, e un messaggio vecchio su un "sì" sarebbe un dato
        // che l'organizzatore legge male.
        expect(second.response?.declineMessage).toBeNull();
        expect(second.response?.attending).toBe("maybe");

        const stored = await rows<"rsvpResponses">(t, "rsvpResponses");
        expect(stored).toHaveLength(1);
        // `submittedAt` è la *prima* compilazione, e non cambia agli aggiornamenti.
        expect(stored[0]!.submittedAt).toBeLessThanOrEqual(stored[0]!.updatedAt);

        const activities = await rows<"guestActivities">(t, "guestActivities");
        expect(activities.map((activity) => activity.type)).toEqual(["rsvp_submitted", "rsvp_updated"]);
    });

    it("rejects an invalid submission with the legacy error messages", async () => {
        const { s, token } = await readyEvent();

        // Il legacy rispondeva 422 con `statusMessage = errors[0]` e l'elenco
        // completo in `data.errors`: il port non può cambiare il testo, perché è
        // quello che il renderer mostra all'ospite.
        let caught: unknown;
        try {
            await s.mutation(api.rsvp.submit, {
                token,
                attending: "yes",
                companionsCount: 0,
                answers: {},
            });
        } catch (error) {
            caught = error;
        }

        const data = (caught as { data?: { code?: string; message?: string; errors?: string[] } })
            .data;
        expect(data?.code).toBe("RSVP_INVALID");
        expect(data?.errors).toEqual([
            "La risposta a «A cosa partecipi?» è obbligatoria.",
            "La risposta a «Preferenza menu» è obbligatoria.",
        ]);
        // `message` è il primo errore, non l'elenco concatenato.
        expect(data?.message).toBe(data?.errors?.[0]);
    });

    it("rejects a companions answer that outnumbers the declared companions", async () => {
        const { s, token } = await readyEvent();

        // Due menu per un solo accompagnatore dichiarato: la regola per-persona
        // del legacy rifiuta, non tronca.
        await expectCode(
            s.mutation(api.rsvp.submit, {
                token,
                attending: "yes",
                companionsCount: 1,
                answers: {
                    q_participation: ["Cerimonia"],
                    companion_names: { companions: ["Uno"] },
                    q_menu: { self: "Carne", companions: ["Pesce", "Vegano"] },
                },
            }),
            "RSVP_INVALID",
        );
    });

    it("persists only the visible questions, never an injected key", async () => {
        const { t, s, token } = await readyEvent({
            rsvpConfig: [
                {
                    id: "attendance",
                    label: "Partecipi?",
                    type: "single",
                    options: ["Sì", "No", "Forse"],
                    required: true,
                    perPerson: false,
                    locked: true,
                },
                {
                    id: "q_team",
                    label: "Squadra",
                    type: "single",
                    options: ["Blu", "Rosso"],
                    required: false,
                    perPerson: false,
                },
                {
                    id: "q_only_blue",
                    label: "Solo per il team blu",
                    type: "text",
                    required: false,
                    perPerson: false,
                    condition: { questionId: "q_team", op: "eq", value: "Blu" },
                },
            ] as never,
        });

        await s.mutation(api.rsvp.submit, {
            token,
            attending: "yes",
            companionsCount: 0,
            answers: {
                q_team: "Rosso",
                q_only_blue: "iniettata",
                q_injected: "chiave estranea",
                attendance: "no",
            },
        });

        const stored = await rows<"rsvpResponses">(t, "rsvpResponses");
        const answers = stored[0]!.answers;
        expect(answers.q_team).toBe("Rosso");
        // Ramo nascosto e chiave fuori config: non entrano nel database (§8.4).
        expect(answers.q_only_blue).toBeUndefined();
        expect(answers.q_injected).toBeUndefined();
        // 'attendance' è già il campo `attending`.
        expect(answers.attendance).toBeUndefined();
    });

    it("tracks the email open exactly once", async () => {
        const { t, s, token } = await readyEvent();

        expect(await s.mutation(api.rsvp.trackEmailOpen, { token })).toEqual({ tracked: true });
        expect(await s.mutation(api.rsvp.trackEmailOpen, { token })).toEqual({ tracked: false });

        const activities = await rows<"guestActivities">(t, "guestActivities");
        expect(activities.map((activity) => activity.type)).toEqual(["email_opened"]);

        // Token inesistente: no-op, nessun oracolo.
        expect(await s.mutation(api.rsvp.trackEmailOpen, { token: "nonesiste0" })).toEqual({
            tracked: false,
        });
    });
});

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

describe("reminders", () => {
    it("caps the configured reminders at the tier limit", async () => {
        const { s } = await bootstrap();
        const event = await createEvent(s);

        await expectCode(
            s.mutation(api.reminders.save, {
                eventId: event._id,
                reminders: [1, 2, 3, 4].map((days) => ({
                    daysBefore: days,
                    subject: `Promemoria ${days}`,
                    message: "Ciao {nome}",
                    enabled: true,
                })),
            }),
            "REMINDER_LIMIT_REACHED",
        );

        const saved = await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [3, 7, 14].map((days) => ({
                daysBefore: days,
                subject: `Promemoria ${days}`,
                message: "Ciao {nome}",
                enabled: true,
            })),
        });
        expect(saved).toHaveLength(3);
        expect(saved.every((reminder) => reminder.pending)).toBe(true);
    });

    it("keeps a sent reminder immutable and counts it against the limit", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        const [sent, other] = await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [7, 3].map((days) => ({
                daysBefore: days,
                subject: `Promemoria ${days}`,
                message: "Ciao {nome}",
                enabled: true,
            })),
        });

        await t.run(async (c) => {
            await c.db.patch(sent!._id, { sentAt: Date.now(), pending: false });
        });

        // Tre nuovi reminder + quello inviato = 4 > 3: il limite tiene conto di
        // ciò che resta in tabella, non solo di ciò che il form invia.
        await expectCode(
            s.mutation(api.reminders.save, {
                eventId: event._id,
                reminders: [1, 2, 5].map((days) => ({
                    daysBefore: days,
                    subject: "Nuovo",
                    message: "Ciao {nome}",
                    enabled: true,
                })),
            }),
            "REMINDER_LIMIT_REACHED",
        );

        const after = await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [
                { id: sent!._id, daysBefore: 1, subject: "Riscritto", message: "No", enabled: false },
                { daysBefore: 1, subject: "Nuovo", message: "Ciao {nome}", enabled: true },
            ],
        });

        // L'inviato conserva il suo contenuto (skip silenzioso); il non citato e
        // non inviato viene cancellato; l'id sconosciuto non crea nulla.
        const kept = after.find((reminder) => reminder._id === sent!._id)!;
        expect(kept.subject).toBe("Promemoria 7");
        expect(after.some((reminder) => reminder._id === other!._id)).toBe(false);
        expect(after).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// Audit e progetti
// ---------------------------------------------------------------------------

describe("audit and projects", () => {
    it("writes the audit inside the mutation it describes", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        const guest = await createGuest(s, event._id);
        await s.mutation(api.events.update, { eventId: event._id, input: { title: "Nuovo titolo" } });
        await s.mutation(api.guests.softDelete, { eventId: event._id, guestId: guest!._id });

        const actions = (await rows<"auditLogs">(t, "auditLogs")).map((row) => row.action).sort();
        expect(actions).toEqual(
            [
                "event.created",
                "event.updated",
                "guest.created",
                "guest.deleted",
                "organization.created",
                "organization.member_provisioned",
            ].sort(),
        );

        // Nessun audit per le azioni dell'ospite: non c'è un attore. La traccia è
        // `guestActivities`.
        const guestActions = (await rows<"guestActivities">(t, "guestActivities")).map(
            (row) => row.type,
        );
        expect(guestActions).toEqual([]);
    });

    it("does not let a project be reached from another organization", async () => {
        const { t, s } = await bootstrap();
        const created = await s.mutation(api.projects.create, { input: { name: "Mio" } });

        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});

        await expectCode(
            bobSession.query(api.projects.get, { projectId: created.projectId }),
            "PROJECT_NOT_FOUND",
        );
        await expectCode(
            bobSession.mutation(api.projects.remove, { projectId: created.projectId }),
            "PROJECT_NOT_FOUND",
        );
    });

    it("clears the project description on null", async () => {
        const { s } = await bootstrap();
        const created = await s.mutation(api.projects.create, {
            input: { name: "Progetto", description: "Descrizione" },
        });

        await s.mutation(api.projects.update, {
            projectId: created.projectId,
            input: { description: null },
        });

        const project = await s.query(api.projects.get, { projectId: created.projectId });
        expect(project.description).toBeUndefined();
        expect(project.status).toBe("active");
    });

    /**
     * `listAll` è la vista UI aggiunta dal Task 14: una lista sola e viva, con un
     * tetto **dichiarato** invece che silenzioso. Le tre proprietà che la rendono
     * usabile al posto dei cursori sono qui.
     */
    it("lists the whole organization and says so when the cap bites", async () => {
        const { t, s, organizationId } = await bootstrap();
        await s.mutation(api.projects.create, { input: { name: "Primo" } });
        await s.mutation(api.projects.create, { input: { name: "Secondo" } });

        const small = await s.query(api.projects.listAll, {});
        // L'ordine è `createdAt` desc come la lista eventi legacy; il confronto
        // usa i nomi per non dipendere da due `insert` nello stesso millisecondo.
        expect(small.projects.map((project) => project.name).sort()).toEqual([
            "Primo",
            "Secondo",
        ]);
        expect(small.truncated).toBe(false);

        // Il tetto si verifica al confine, non "a occhio": si supera di uno e si
        // guarda `truncated`, che è l'unica cosa che la UI può mostrare. Le righe
        // extra si inseriscono direttamente perché la mutation ha limiti di piano.
        await t.run(async (ctx) => {
            for (let i = 0; i < UI_LIST_LIMIT; i++) {
                await ctx.db.insert("projects", {
                    organizationId,
                    name: `Progetto ${i}`,
                    status: "active",
                    createdAt: 1_700_000_000_000 + i,
                    updatedAt: 1_700_000_000_000 + i,
                });
            }
        });

        const capped = await s.query(api.projects.listAll, {});
        expect(capped.projects).toHaveLength(UI_LIST_LIMIT);
        expect(capped.truncated).toBe(true);
    });

    it("listAll sees only the caller's organization", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.projects.create, { input: { name: "Mio" } });

        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});

        const mine = await s.query(api.projects.listAll, {});
        const theirs = await bobSession.query(api.projects.listAll, {});

        expect(mine.projects.map((project) => project.name)).toEqual(["Mio"]);
        expect(theirs.projects).toEqual([]);
    });

    it("listAll needs an organization, like every other tenant query", async () => {
        const t = initConvexTest();
        await expectCode(t.query(api.projects.listAll, {}), "UNAUTHENTICATED");
    });
});

// ---------------------------------------------------------------------------
// Statistiche
// ---------------------------------------------------------------------------

describe("event stats", () => {
    it("aggregates the kpi, the timeline and the attention list", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        await activate(s, event._id);

        const yes = await createGuest(s, event._id, { email: "yes@example.com", firstName: "Yes" });
        const no = await createGuest(s, event._id, { email: "no@example.com", firstName: "No" });
        const silent = await createGuest(s, event._id, { email: "silent@example.com", firstName: "Silent" });

        await s.mutation(api.rsvp.submit, {
            token: await guestTokenOf(t, yes!._id),
            attending: "yes",
            ...yesAnswers(2),
        });
        await s.mutation(api.rsvp.submit, {
            token: await guestTokenOf(t, no!._id),
            attending: "no",
            companionsCount: 0,
            answers: { decline_message: "x" },
        });

        // Un ospite che ha aperto 10 giorni fa e non ha risposto.
        await t.run(async (c) => {
            await c.db.patch(silent!._id, { firstOpenedAt: Date.now() - 10 * 24 * 60 * 60 * 1000 });
        });

        const stats = await s.query(api.events.stats, { eventId: event._id });

        expect(stats.kpi).toMatchObject({
            totalGuests: 3,
            responded: 2,
            confirmed: 1,
            declined: 1,
            maybe: 0,
            pending: 1,
            totalPeople: 3,
        });
        expect(stats.timeline).toHaveLength(28);
        expect(stats.timeline[27]!.confirmed).toBe(1);
        expect(stats.timeline[27]!.declined).toBe(1);
        expect(stats.needsAttention).toHaveLength(1);
        // Il nome è quello completo, e il contatto la prima via disponibile.
        expect(stats.needsAttention[0]).toMatchObject({
            guestId: silent!._id,
            name: "Silent Lovelace",
            contact: "silent@example.com",
            openedDaysAgo: 10,
        });
        expect(stats.noEmailPending).toBe(0);
    });

    it("breaks down menus and allergies across companions", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);
        await s.mutation(api.events.update, {
            eventId: event._id,
            input: {
                status: "active",
                rsvpConfig: [
                    {
                        id: "attendance",
                        label: "Partecipi?",
                        type: "single",
                        options: ["Sì", "No", "Forse"],
                        required: true,
                        perPerson: false,
                        locked: true,
                    },
                    {
                        id: "q_menu",
                        label: "Menu",
                        type: "single",
                        options: ["Carne", "Pesce", "Vegetariano"],
                        required: false,
                        perPerson: true,
                    },
                    {
                        id: "q_allergie",
                        label: "Allergie",
                        type: "text",
                        required: false,
                        perPerson: true,
                    },
                ] as never,
            },
        });

        const guest = await createGuest(s, event._id, { email: "menu@example.com" });
        await s.mutation(api.rsvp.submit, {
            token: await guestTokenOf(t, guest!._id),
            attending: "yes",
            companionsCount: 2,
            answers: {
                q_menu: { self: "Pesce", companions: ["Pesce", "Carne"] },
                q_allergie: { self: "Noci", companions: ["Noci"] },
            },
        });

        const stats = await s.query(api.events.stats, { eventId: event._id });
        expect(stats.menuBreakdown).toEqual([
            { label: "Pesce", count: 2 },
            { label: "Carne", count: 1 },
        ]);
        expect(stats.allergies).toEqual([{ value: "Noci", count: 2 }]);
    });
});

// ---------------------------------------------------------------------------
// Il cron è di un altro task, ma il suo stato deve essere già corretto
// ---------------------------------------------------------------------------

describe("reminder processing state", () => {
    it("marks a reminder pending only while it can still be sent", async () => {
        const { t, s } = await bootstrap();
        const event = await createEvent(s);

        const [enabled] = await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [
                { daysBefore: 7, subject: "A", message: "B", enabled: true },
            ],
        });

        const pendingRows = await t.run(async (c) =>
            await c.db
                .query("eventReminders")
                .withIndex("by_enabled_pending", (q) => q.eq("enabled", true).eq("pending", true))
                .collect(),
        );
        expect(pendingRows.map((row) => row._id)).toEqual([enabled!._id]);

        // Disabilitato → fuori dall'indice dei "da inviare".
        await s.mutation(api.reminders.save, {
            eventId: event._id,
            reminders: [
                {
                    id: enabled!._id,
                    daysBefore: 7,
                    subject: "A",
                    message: "B",
                    enabled: false,
                },
            ],
        });

        const after = await t.run(async (c) =>
            await c.db
                .query("eventReminders")
                .withIndex("by_enabled_pending", (q) => q.eq("enabled", true).eq("pending", true))
                .collect(),
        );
        expect(after).toHaveLength(0);
    });

    it("keeps the domain functions free of client-supplied organization ids", async () => {
        // Non è un test di comportamento ma di contratto: nessuna funzione pubblica
        // del dominio accetta un `organizationId`, quindi non esiste un input da
        // cui il tenant possa arrivare.
        const { s } = await bootstrap();
        const event = await createEvent(s);

        let caught: unknown;
        try {
            await s.mutation(
                api.events.update,
                {
                    eventId: event._id,
                    input: { title: "x" },
                    organizationId: event.organizationId,
                } as never,
            );
        } catch (error) {
            caught = error;
        }

        // Il rifiuto arriva dal validator degli argomenti, prima dell'handler:
        // nessun percorso di codice può leggere quell'input.
        expect(caught).toBeDefined();
        expect(String((caught as Error).message)).toContain("organizationId");
        expect(await s.query(api.events.get, { eventId: event._id })).toMatchObject({
            title: "Giulia & Tommaso",
        });

        void internal;
    });
});
