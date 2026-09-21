import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { initConvexTestWithAuthComponent } from "./test.setup";
import { ACCOUNT_DELETION_GRACE_DAYS } from "./profile";
import { DEFAULT_SITE_MODE, SITE_MODES } from "./siteSettings";
import { EXPORT_TTL_MS } from "./dataExports";
import { JOB_TYPES, enqueueJob } from "./lib/jobQueue";
import { signBridgeRequest } from "./lib/bridgeHmac";
import { hashClientIp, isIpHashShaped } from "./lib/spam";
import { getTemplatesByType } from "./lib/inviteTemplates";

/** Chiave del template matrimonio: la stessa che usa il client per creare un evento. */
const MATRIMONIO_TEMPLATE = getTemplatesByType("matrimonio")[0]!.key;

/**
 * Task 12 — profilo, GDPR, form pubblici, coda di job e site mode.
 *
 * Il criterio è quello del Task 11: le asserzioni vengono dal comportamento legacy
 * (le soglie, i messaggi, i conteggi) e dai requisiti del piano (idempotenza,
 * fail-closed, dati personali che non entrano in Convex). Dove il port si discosta
 * dal legacy, il test lo dichiara nel nome o nel commento invece di nasconderlo.
 *
 * Il bridge verso R2 e verso il Worker è **stubbato**: `globalThis.fetch` diventa
 * un registratore che risponde come risponderebbe il bridge. Così i job girano
 * davvero (attraverso `internal.jobs.run`) senza uscire dalla rete, e si può
 * simulare il guasto che conta — un delete R2 che fallisce.
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

let fetchCalls: Array<{ url: string; payload: Record<string, unknown> }> = [];

/** Risposta del bridge stub: un put riesce, un download firma un URL. */
const defaultResponder = () => ({
    status: 200,
    body: { ok: true, url: "https://r2.test/signed", expiresAt: Date.now() + 300_000 },
});

let fetchResponder: (payload: Record<string, unknown>) => { status: number; body: unknown } =
    defaultResponder;

/**
 * I timer sono finti per tutta la durata del test, e `Date` **non** lo è.
 *
 * Due ragioni, entrambe misurate. La prima: `enqueueJob` schedula con
 * `runAfter(0)` e `Date.now()` governa ogni scadenza di questa suite (grace
 * window, TTL dell'export, timestamp del form), quindi il tempo deve restare
 * reale mentre i timer no. La seconda: con i timer veri una consegna può partire
 * *dopo* la fine del test che l'ha accodata e scrivere su R2 durante il
 * successivo — l'asserzione che legge le chiamate al bridge diventa allora
 * un'affermazione sull'ordine dei test. Con i timer finti nulla parte da solo, e
 * `drainJobs` fa partire la coda quando decide il test.
 */
beforeEach(() => {
    fetchCalls = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    // Il responder si **ripristina**: i test che simulano un guasto lo sostituiscono,
    // e senza questo reset il guasto di un test diventa la risposta normale del
    // successivo — che è come sono stati trovati dei "fallimenti" che appartenevano
    // a un altro test.
    fetchResponder = defaultResponder;
    process.env.STORAGE_BRIDGE_URL = BRIDGE_URL;
    process.env.STORAGE_BRIDGE_SECRET = "bridge-secret-under-test";

    // The bridge client signs a canonical body and posts it; the stub records the
    // payload so a test can assert *what* was asked of R2 (a put, a delete, a
    // signed download) without a bucket.
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        let payload: Record<string, unknown> = {};
        try {
            payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
            payload = {};
        }
        fetchCalls.push({ url: String(_url), payload });

        const simulated = fetchResponder(payload);
        return new Response(JSON.stringify(simulated.body), {
            status: simulated.status,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
});

afterEach(() => {
    vi.useRealTimers();
    delete process.env.STORAGE_BRIDGE_URL;
    delete process.env.STORAGE_BRIDGE_SECRET;
});

async function bootstrap(email = "alice@example.com", name = "Alice"): Promise<Fixture> {
    const t = await initConvexTestWithAuthComponent();
    register(t);

    // `create` restituisce il documento creato, non l'id: prenderne l'`_id` è
    // l'unico modo di avere il subject giusto (un cast a string passerebbe il
    // compilatore e produrrebbe un identity.subject oggetto, che il validator di
    // `appUsers` rifiuta).
    const created = (await t.run(async (ctx) =>
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
    const authUserId = created._id;

    const s = t.withIdentity({ subject: authUserId, email, name });
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});

    return {
        t,
        s,
        authUserId,
        appUserId: provisioned.appUserId,
        organizationId: provisioned.organizationId,
    };
}

const rows = <T extends TableNames>(t: Test, table: T): Promise<Doc<T>[]> =>
    t.run(async (ctx) => await ctx.db.query(table).collect());

/** Riga `files` valida: i campi obbligatori sono tanti e il validator li pretende. */
const fileFixture = (organizationId: Id<"organizations">, uploadedBy: Id<"appUsers">, path: string) => ({
    organizationId,
    uploadedBy,
    originalName: "invito.png",
    mimeType: "image/png",
    fileType: "image",
    size: 1024,
    path,
    basePath: path.replace(/\/original\.png$/, ""),
    isPublic: true,
    isActive: true,
    uploadStatus: "active" as const,
    variantType: "original" as const,
    variantStatus: "none" as const,
    variantAttempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

const jobRows = (t: Test) => rows(t, "jobExecutions");

/**
 * Avanza la coda come farebbero il cron e lo scheduler.
 *
 * Due passi, in quest'ordine: `enqueueDuePurges` è il cron (guarda se ci sono
 * account con la grace window scaduta e, se ce ne sono, accoda il purge), poi
 * `finishAllScheduledFunctions` fa girare i job **davvero**, attraverso
 * `internal.jobs.run`, come farebbe lo scheduler in produzione. Nessuna
 * scorciatoia: la suite non chiama il runner al posto dello scheduler, verifica
 * il percorso che esiste.
 *
 * Gli stati si leggono dalla tabella, non dal valore di ritorno di un'esecuzione:
 * il contratto da verificare è lo stato finale del job, non chi l'ha portato a
 * termine. Un retry con `runAfter(30_000)` non scatta — il suo momento non è
 * arrivato nell'orologio reale — quindi un fallimento resta `pending` e la suite
 * può affermarlo invece di sperarlo.
 */
async function drainJobs(t: Test): Promise<string[]> {
    await t.mutation(internal.jobs.enqueueDuePurges, {});

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    return (await jobRows(t)).map((job) => job.status);
}

const auditActions = async (t: Test): Promise<string[]> =>
    (await rows(t, "auditLogs")).map((row) => row.action).sort();

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

// ---------------------------------------------------------------------------
// Profilo
// ---------------------------------------------------------------------------

describe("profile", () => {
    it("returns the profile with the auth provider, reading name/image from the component", async () => {
        const { s } = await bootstrap();

        const result = await s.query(api.profile.current, {});

        expect(result.profile).toMatchObject({
            email: "alice@example.com",
            fullName: "Alice",
            image: null,
            phone: null,
            bio: null,
            locale: "it-IT",
        });
        // Nessun account `credential` creato in questo ambiente: il fallback è
        // "email" come nel legacy (la UI mostrerebbe il cambio password).
        expect(result.authProvider).toBe("email");
    });

    it("updates the app-owned fields on appUsers and the identity fields on the component", async () => {
        const { t, s, appUserId, authUserId } = await bootstrap();

        const result = await s.mutation(api.profile.update, {
            input: {
                fullName: "Alice Rossi",
                phone: "+39 333 0000000",
                bio: "Wedding planner",
                timezone: "Europe/Rome",
                locale: "en",
            },
        });

        expect(result).toEqual({ success: true });

        const appUser = (await t.run(async (ctx) => await ctx.db.get(appUserId)))!;
        expect(appUser).toMatchObject({
            phone: "+39 333 0000000",
            bio: "Wedding planner",
            timezone: "Europe/Rome",
            locale: "en",
        });

        const componentUser = (await t.run(async (ctx) =>
            await ctx.runQuery(components.betterAuth.adapter.findOne, {
                model: "user",
                where: [{ field: "_id", value: authUserId }],
            }),
        )) as { name?: string };
        expect(componentUser.name).toBe("Alice Rossi");

        expect(await auditActions(t)).toContain("user.profile_updated");
    });

    it("clears a nullable field on explicit null", async () => {
        const { t, s, appUserId } = await bootstrap();
        await s.mutation(api.profile.update, { input: { phone: "+39 1", bio: "x" } });

        await s.mutation(api.profile.update, { input: { phone: null, bio: null } });

        const appUser = (await t.run(async (ctx) => await ctx.db.get(appUserId)))!;
        expect(appUser.phone).toBeUndefined();
        expect(appUser.bio).toBeUndefined();
    });

    it("refuses role, email and id in the input instead of ignoring them", async () => {
        const { t, s, appUserId } = await bootstrap();

        for (const input of [{ role: "superAdmin" }, { email: "other@example.com" }, { id: "x" }]) {
            await expect(s.mutation(api.profile.update, { input } as never)).rejects.toThrow();
        }

        // ...e nulla è cambiato: il rifiuto arriva dal validator degli argomenti,
        // prima dell'handler.
        const appUser = (await t.run(async (ctx) => await ctx.db.get(appUserId)))!;
        expect(appUser.globalRole).toBe("user");
        expect(appUser.email).toBe("alice@example.com");
    });

    it("refuses a name shorter than the client's own rule", async () => {
        const { s } = await bootstrap();

        await expectCode(s.mutation(api.profile.update, { input: { fullName: "A" } }), "PROFILE_NAME_TOO_SHORT");
    });

    it("requires authentication for both reads and writes", async () => {
        const { t } = await bootstrap();
        register(t);

        await expectCode(t.query(api.profile.current, {}), "UNAUTHENTICATED");
        await expectCode(t.mutation(api.profile.update, { input: {} }), "UNAUTHENTICATED");
        await expectCode(t.mutation(api.profile.requestDeletion, {}), "UNAUTHENTICATED");
    });
});

// ---------------------------------------------------------------------------
// Cancellazione differita e purge
// ---------------------------------------------------------------------------

describe("account deletion", () => {
    it("schedules the purge 30 days out, audits it and revokes the sessions", async () => {
        const { t, s, authUserId } = await bootstrap();

        await t.run(async (ctx) =>
            await ctx.runMutation(components.betterAuth.adapter.create, {
                input: {
                    model: "session",
                    data: {
                        userId: authUserId,
                        token: "session-token-1",
                        expiresAt: Date.now() + 86_400_000,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                },
            }),
        );

        const result = await s.mutation(api.profile.requestDeletion, {});

        expect(result.graceDays).toBe(ACCOUNT_DELETION_GRACE_DAYS);
        const purgeAt = Date.parse(result.purgeAt);
        const expected = Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000;
        expect(Math.abs(purgeAt - expected)).toBeLessThan(60_000);

        const appUser = (await t.run(async (ctx) =>
            (await ctx.db.query("appUsers").collect())[0],
        ))!;
        expect(appUser.deletionRequestedAt).toBeTypeOf("number");
        expect(appUser.purgeAt).toBe(purgeAt);

        // Le sessioni sono revocate subito: senza questo l'account "cancellato"
        // resterebbe loggato fino alla scadenza del token.
        const sessions = (await t.run(async (ctx) =>
            await ctx.runQuery(components.betterAuth.adapter.findMany, {
                model: "session",
                where: [{ field: "userId", value: authUserId }],
                paginationOpts: { numItems: 50, cursor: null },
            }),
        )) as { page: unknown[] };
        expect(sessions.page).toHaveLength(0);

        expect(await auditActions(t)).toContain("user.account_deleted");
    });

    it("blocks every authenticated call while the deletion is pending", async () => {
        const { s } = await bootstrap();
        await s.mutation(api.profile.requestDeletion, {});

        // Lo stato non è un commento: `requireAppUser` lo rispetta, quindi il
        // backend è chiuso per un account programmato per la cancellazione.
        await expectCode(s.query(api.profile.current, {}), "ACCOUNT_SCHEDULED_FOR_DELETION");
        await expectCode(s.mutation(api.projects.create, { input: { name: "X" } }), "ACCOUNT_SCHEDULED_FOR_DELETION");
    });

    it("is idempotent: a second request keeps the first purge date", async () => {
        const { t, s, appUserId } = await bootstrap();

        const first = await s.mutation(api.profile.requestDeletion, {});
        const second = await s.mutation(api.profile.requestDeletion, {});

        expect(second.purgeAt).toBe(first.purgeAt);
        const appUser = (await t.run(async (ctx) => await ctx.db.get(appUserId)))!;
        expect(appUser.purgeAt).toBe(Date.parse(first.purgeAt));
    });

    it("purges a sole-member organization, its graph and its R2 objects", async () => {
        const { t, s, appUserId, organizationId } = await bootstrap();

        const event = await s.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Matrimonio" },
        });
        await s.mutation(api.guests.create, {
            eventId: event._id,
            input: { firstName: "Ada", lastName: "L", email: "ada@example.com" },
        });

        const filePath = `evt/${event._id}/2026-09/abc/original.png`;
        await t.run(
            async (ctx) =>
                await ctx.db.insert("files", fileFixture(organizationId, appUserId, filePath)),
        );

        await t.run(async (ctx) => {
            await ctx.db.patch(appUserId, { purgeAt: Date.now() - 1000 });
        });

        const statuses = await drainJobs(t);
        expect(statuses).toEqual(["succeeded"]);

        // R2 prima del database: l'oggetto è stato chiesto al bridge.
        expect(fetchCalls.some((call) => call.payload.op === "delete")).toBe(true);
        expect(fetchCalls.find((call) => call.payload.op === "delete")?.payload.key).toBe(
            `evt/${event._id}/2026-09/abc/original.png`,
        );

        expect(await rows(t, "events")).toHaveLength(0);
        expect(await rows(t, "guests")).toHaveLength(0);
        expect(await rows(t, "files")).toHaveLength(0);
        expect(await rows(t, "memberships")).toHaveLength(0);
        expect(await rows(t, "organizations")).toHaveLength(0);
        expect(await rows(t, "appUsers")).toHaveLength(0);

        const componentUsers = (await t.run(async (ctx) =>
            await ctx.runQuery(components.betterAuth.adapter.findMany, {
                model: "user",
                where: [],
                paginationOpts: { numItems: 50, cursor: null },
            }),
        )) as { page: unknown[] };
        expect(componentUsers.page).toHaveLength(0);

        expect(await auditActions(t)).toContain("user.account_purged");
    });

    it("transfers ownership instead of destroying another tenant's data", async () => {
        const owner = await bootstrap("owner@example.com", "Owner");
        const member = owner.t.withIdentity({
            subject: "auth_member",
            email: "member@example.com",
            name: "Member",
        });
        const memberProvisioned = await member.mutation(api.organizations.ensureProvisioned, {});

        // Il membro entra nell'organizzazione dell'owner con un invito accettato.
        const invitation = await owner.s.mutation(api.organizations.inviteMember, {
            email: "member@example.com",
            role: "admin",
        });
        await member.mutation(api.organizations.acceptInvitation, {
            token: invitation.token,
        });

        await owner.t.run(async (ctx) => {
            await ctx.db.patch(owner.appUserId, { purgeAt: Date.now() - 1000 });
        });

        await drainJobs(owner.t);

        // Due organizzazioni, non una: il provisioning dà a ogni utente un
        // workspace, quindi il membro ne possiede già uno suo (il caso B2C) e il
        // purge non lo tocca. Un'asserzione sul *totale* non direbbe nulla su cosa
        // è successo all'organizzazione dell'owner — la sola di cui questo test
        // parla — quindi si guarda quella per id.
        const organizations = await rows(owner.t, "organizations");
        const organizationIds = organizations.map((row) => row._id);
        expect(organizationIds).toContain(owner.organizationId);
        expect(organizationIds).toContain(memberProvisioned.organizationId);

        // L'eredità: una sola membership nell'organizzazione dell'owner, con il
        // ruolo di owner, e assegnata al membro — non all'utente cancellato.
        const memberships = await rows(owner.t, "memberships");
        const inherited = memberships.filter((row) => row.organizationId === owner.organizationId);
        expect(inherited).toHaveLength(1);
        expect(inherited[0]!.role).toBe("owner");
        expect(inherited[0]!.userId).toBe(memberProvisioned.appUserId);

        // L'utente cancellato non è rimasto membro di **niente**, e il workspace
        // del membro ha ancora il suo proprietario: il purge non si è liberato di
        // un utente distruggendo i dati di un altro tenant.
        expect(memberships.every((row) => row.userId !== owner.appUserId)).toBe(true);
        const memberOwn = memberships.filter(
            (row) => row.organizationId === memberProvisioned.organizationId,
        );
        expect(memberOwn).toHaveLength(1);
        expect(memberOwn[0]!.role).toBe("owner");

        expect(await rows(owner.t, "appUsers")).toHaveLength(1);
    });

    it("keeps the account when an R2 delete fails, instead of orphaning the objects", async () => {
        const { t, s, appUserId, organizationId } = await bootstrap();
        const event = await s.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Matrimonio" },
        });

        // Il bridge rifiuta il delete: gli oggetti restano, quindi le righe devono
        // restare — altrimenti i file diventerebbero irraggiungibili per sempre.
        fetchResponder = (payload) =>
            payload.op === "delete"
                ? { status: 500, body: { ok: false, code: "BRIDGE_OBJECT_FAILED" } }
                : { status: 200, body: { ok: true } };

        await t.run(async (ctx) => {
            await ctx.db.insert(
                "files",
                fileFixture(organizationId, appUserId, `evt/${event._id}/2026-09/abc/original.png`),
            );
            await ctx.db.patch(appUserId, { purgeAt: Date.now() - 1000 });
        });

        const statuses = await drainJobs(t);

        // Il job non fallisce (il purge è isolato per account) ma l'account resta:
        // `purgeAt` è nel passato, quindi il giro successivo lo riprova.
        expect(statuses).toEqual(["succeeded"]);
        expect(await rows(t, "appUsers")).toHaveLength(1);
        expect(await rows(t, "organizations")).toHaveLength(1);
        expect(await rows(t, "files")).toHaveLength(1);

        const job = (await jobRows(t))[0]!;
        expect(job.result).toMatchObject({ purged: 0 });
        expect(JSON.stringify(job.result)).toContain("r2_delete_failed");
    });
});

// ---------------------------------------------------------------------------
// Export GDPR
// ---------------------------------------------------------------------------

describe("data export", () => {
    it("creates the request, enqueues exactly one job and stays idempotent", async () => {
        const { t, s } = await bootstrap();

        const first = await s.mutation(api.dataExports.request, {});
        const second = await s.mutation(api.dataExports.request, {});

        expect(first.alreadyPending).toBe(false);
        expect(second.alreadyPending).toBe(true);
        expect(second.exportId).toBe(first.exportId);

        const jobs = await jobRows(t);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.name).toBe(JOB_TYPES.dataExport);
        expect(jobs[0]!.status).toBe("pending");

        expect(await auditActions(t)).toContain("user.data_export_requested");

        // La coda si consuma alla fine: il job è stato verificato `pending`, ma
        // lasciarlo in volo lo farebbe eseguire durante il test successivo, e la
        // scrittura su R2 finirebbe nell'asserzione di un altro test.
        await drainJobs(t);
    });

    it("collects the personal data and writes it to R2 through the bridge", async () => {
        const { t, s, appUserId, organizationId } = await bootstrap();

        const event = await s.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Matrimonio" },
        });
        await t.run(async (ctx) => {
            await ctx.db.insert(
                "files",
                fileFixture(organizationId, appUserId, `evt/${event._id}/2026-09/abc/original.png`),
            );
        });

        const request = await s.mutation(api.dataExports.request, {});
        await drainJobs(t);

        const put = fetchCalls.find((call) => call.payload.op === "put");
        expect(put).toBeDefined();
        expect(String(put!.payload.key)).toMatch(
            new RegExp(`^exports/${appUserId}/\\d{4}-\\d{2}/${String(request.exportId)}\\.json$`),
        );

        // Il payload è JSON base64: decodificato deve contenere le sezioni del legacy.
        const decoded = Buffer.from(String(put!.payload.body), "base64").toString("utf8");
        const payload = JSON.parse(decoded) as Record<string, never>;
        expect(payload.user).toMatchObject({ email: "alice@example.com", name: "Alice" });
        expect(payload.organizations).toHaveLength(1);
        expect(payload.events).toHaveLength(1);
        expect(payload.files).toHaveLength(1);
        expect(payload).toHaveProperty("auditLogs");
        expect(payload.exportVersion).toBe("2.0");

        const status = await s.query(api.dataExports.status, {});
        expect(status.hasExport).toBe(true);
        expect(status.export).toMatchObject({ status: "completed", fileSize: expect.any(Number) });
        expect(status.export!.expiresAt! - status.export!.completedAt!).toBe(EXPORT_TTL_MS);
    });

    it("never re-runs a completed export", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.dataExports.request, {});
        await drainJobs(t);

        const before = fetchCalls.length;
        await t.run(async (ctx) => {
            const job = (await ctx.db.query("jobExecutions").collect())[0]!;
            await ctx.db.patch(job._id, { status: "pending" });
        });
        await drainJobs(t);

        // Nessuna seconda put: il job trova l'export completato e non ricomincia.
        expect(fetchCalls.length).toBe(before);
    });

    it("signs a short-lived URL only for the owner and only when ready", async () => {
        const { t, s } = await bootstrap();
        const request = await s.mutation(api.dataExports.request, {});

        // Non pronto: nessun URL.
        await expectCode(
            s.action(api.dataExports.downloadUrl, { exportId: request.exportId }),
            "EXPORT_NOT_READY",
        );

        await drainJobs(t);

        const signed = await s.action(api.dataExports.downloadUrl, { exportId: request.exportId });
        expect(signed.url).toBe("https://r2.test/signed");
        expect(fetchCalls.at(-1)!.payload).toMatchObject({ op: "sign-download", expiresInSeconds: 300 });

        // Un altro utente non vede nemmeno che l'export esiste.
        const bob = t.withIdentity({ subject: "auth_bob", email: "bob@example.com" });
        await bob.mutation(api.organizations.ensureProvisioned, {});
        await expectCode(
            bob.action(api.dataExports.downloadUrl, { exportId: request.exportId }),
            "EXPORT_NOT_FOUND",
        );
    });

    it("reports an expired export as expired, not as ready", async () => {
        const { t, s } = await bootstrap();
        const request = await s.mutation(api.dataExports.request, {});
        await drainJobs(t);

        await t.run(async (ctx) => {
            await ctx.db.patch(request.exportId, { expiresAt: Date.now() - 1000 });
        });

        const status = await s.query(api.dataExports.status, {});
        expect(status.export!.status).toBe("expired");
        await expectCode(
            s.action(api.dataExports.downloadUrl, { exportId: request.exportId }),
            "EXPORT_EXPIRED",
        );
    });

    it("lists the history newest first and never another user's exports", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.dataExports.request, {});
        await drainJobs(t);
        // Il primo export è completato, quindi il secondo non è "già in corso":
        // due righe, ognuna con il suo job.
        await s.mutation(api.dataExports.request, {});
        await drainJobs(t);

        const history = await s.query(api.dataExports.history, {});
        expect(history).toHaveLength(2);
        expect(history[0]!.createdAt).toBeGreaterThanOrEqual(history[1]!.createdAt);

        const bob = t.withIdentity({ subject: "auth_bob", email: "bob@example.com" });
        await bob.mutation(api.organizations.ensureProvisioned, {});
        expect(await bob.query(api.dataExports.history, {})).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Coda di job
// ---------------------------------------------------------------------------

describe("job queue", () => {
    it("refuses a job type nobody would execute", async () => {
        const { t } = await bootstrap();

        // La registry è chiusa: un tipo senza runner non entra in coda, altrimenti
        // esisterebbe un job `pending` che nessuno consumerà mai.
        await expectCode(
            t.run(async (ctx) => await enqueueJob(ctx as never, { type: "email:welcome" })),
            "JOB_TYPE_UNKNOWN",
        );
        expect(await jobRows(t)).toHaveLength(0);
    });

    it("records the attempt, the result and the terminal state", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.dataExports.request, {});
        await drainJobs(t);

        const job = (await jobRows(t))[0]!;
        expect(job.status).toBe("succeeded");
        expect(job.attempt).toBe(1);
        expect(job.startedAt).toBeTypeOf("number");
        expect(job.finishedAt).toBeTypeOf("number");
        expect(job.lastError).toBeUndefined();
    });

    it("fails the export when the bridge refuses, and marks the row failed", async () => {
        const { t, s } = await bootstrap();
        await s.mutation(api.dataExports.request, {});

        fetchResponder = () => ({ status: 503, body: { ok: false, code: "STORAGE_BRIDGE_FAILED" } });
        await drainJobs(t);

        const job = (await jobRows(t))[0]!;
        // Un export senza bridge va a `pending` (retry) e diventa `dead` dopo il
        // tetto: nessuna riga "riuscita" a vuoto.
        expect(["pending", "dead"]).toContain(job.status);
        expect(job.lastError).toContain("STORAGE_BRIDGE_FAILED");

        const status = await s.query(api.dataExports.status, {});
        expect(status.export!.status).toBe("processing");
    });

    it("selects the due accounts by index and never an account that did not ask", async () => {
        const { t, appUserId } = await bootstrap();

        // Un account **senza** `purgeAt` non è dovuto. È l'asserzione che conta: con
        // il solo `lte` questa riga falliva e lo sweep cancellava ogni utente appena
        // creato — un account che non ha mai chiesto la cancellazione.
        const fresh = await t.query(internal.profile.dueAccounts, {});
        expect(fresh).toHaveLength(0);

        // `purgeAt` nel futuro: fuori dall'indice, quindi fuori dalla scansione.
        await t.run(async (ctx) => {
            await ctx.db.patch(appUserId, { purgeAt: Date.now() + 86_400_000 });
        });
        expect(await t.query(internal.profile.dueAccounts, {})).toHaveLength(0);

        // Un secondo account, mai programmato per la cancellazione, e poi l'unico
        // dovuto: la lista dei dovuti non lo contiene, e un lotto di uno restituisce
        // l'account giusto (con il solo `lte` il lotto si riempiva di non dovuti, e
        // il filtro `take`-prima-di-tutto rendeva lo sweep un no-op).
        await t.run(async (ctx) => {
            await ctx.db.insert("appUsers", {
                authUserId: "auth_second",
                email: "second@example.com",
                globalRole: "user",
                locale: "it-IT",
            });
            await ctx.db.patch(appUserId, { purgeAt: Date.now() - 1 });
        });

        const due = await t.query(internal.profile.dueAccounts, {});
        expect(due.map((row) => row.appUserId)).toEqual([appUserId]);

        const batchOfOne = await t.query(internal.profile.dueAccounts, { limit: 1 });
        expect(batchOfOne).toHaveLength(1);
        expect(batchOfOne[0]!.appUserId).toBe(appUserId);
    });
});

// ---------------------------------------------------------------------------
// Form pubblici
// ---------------------------------------------------------------------------

describe("public forms", () => {
    const contactArgs = {
        name: "Ada",
        email: "ada@example.com",
        subject: "Informazioni",
        message: "Vorrei saperne di più",
        language: "it",
        ipHash: "a".repeat(64),
    };

    it("stores a valid message and audits it", async () => {
        const { t } = await bootstrap();

        const result = await t.mutation(internal.publicForms.contact, {
            ...contactArgs,
            _t: Date.now() - 10_000,
        });

        expect(result).toMatchObject({ success: true, stored: true });
        const messages = await rows(t, "contactMessages");
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ email: "ada@example.com", language: "it" });
        expect(await auditActions(t)).toContain("contact.sent");
    });

    it("answers a caught bot with a fake success and stores nothing", async () => {
        const { t } = await bootstrap();

        const honeypot = await t.mutation(internal.publicForms.contact, {
            ...contactArgs,
            website: "http://spam.example",
            _t: Date.now() - 10_000,
        });
        const tooFast = await t.mutation(internal.publicForms.contact, {
            ...contactArgs,
            _t: Date.now(),
        });
        const noTimestamp = await t.mutation(internal.publicForms.contact, {
            ...contactArgs,
        });

        for (const result of [honeypot, tooFast, noTimestamp]) {
            expect(result.success).toBe(true);
            expect(result.stored).toBe(false);
        }
        expect(await rows(t, "contactMessages")).toHaveLength(0);
    });

    it("refuses a disposable address with the legacy message", async () => {
        const { t } = await bootstrap();

        let caught: unknown;
        try {
            await t.mutation(internal.publicForms.contact, {
                ...contactArgs,
                email: "throwaway@mailinator.com",
                _t: Date.now() - 10_000,
            });
        } catch (error) {
            caught = error;
        }

        const data = (caught as { data?: { code?: string; status?: number; message?: string } }).data;
        expect(data?.code).toBe("DISPOSABLE_EMAIL");
        expect(data?.status).toBe(400);
        expect(data?.message).toBe("Usa un indirizzo email permanente.");
    });

    it("limits the contact form per IP and per address with the legacy thresholds", async () => {
        const { t } = await bootstrap();

        // 5 richieste/ora per IP (legacy `isEndpointRateLimited(..., 5, 1h)`).
        for (let index = 0; index < 5; index += 1) {
            await t.mutation(internal.publicForms.contact, {
                ...contactArgs,
                email: `ada${index}@example.com`,
                _t: Date.now() - 10_000,
            });
        }

        let caught: unknown;
        try {
            await t.mutation(internal.publicForms.contact, {
                ...contactArgs,
                email: "ada5@example.com",
                _t: Date.now() - 10_000,
            });
        } catch (error) {
            caught = error;
        }
        expect((caught as { data?: { code?: string; status?: number } }).data).toMatchObject({
            code: "RATE_LIMITED",
            status: 429,
        });
    });

    it("caps the messages per address at 3 in a 24h window", async () => {
        const { t } = await bootstrap();

        // Ogni chiamata da un IP diverso: così il limite che scatta è quello
        // per-indirizzo e non quello per-IP.
        for (let index = 0; index < 3; index += 1) {
            await t.mutation(internal.publicForms.contact, {
                ...contactArgs,
                ipHash: String(index + 1).repeat(64),
                _t: Date.now() - 10_000,
            });
        }

        let caught: unknown;
        try {
            await t.mutation(internal.publicForms.contact, {
                ...contactArgs,
                ipHash: "9".repeat(64),
                _t: Date.now() - 10_000,
            });
        } catch (error) {
            caught = error;
        }
        expect((caught as { data?: { code?: string } }).data?.code).toBe("CONTACT_DAILY_LIMIT");
    });

    it("subscribes to the waiting list once and reports the second attempt as already subscribed", async () => {
        const { t } = await bootstrap();

        const first = await t.mutation(internal.publicForms.waitingList, {
            email: "ada@example.com",
            language: "it",
            ipHash: "b".repeat(64),
            _t: Date.now() - 10_000,
        });
        const second = await t.mutation(internal.publicForms.waitingList, {
            email: "ADA@example.com",
            language: "it",
            ipHash: "b".repeat(64),
            _t: Date.now() - 10_000,
        });

        expect(first).toMatchObject({ success: true, alreadySubscribed: false, stored: true });
        // `emailSent: false` è la verità di questo task: l'invio è del Task 13.
        expect(first.emailSent).toBe(false);
        expect(second).toMatchObject({ success: true, alreadySubscribed: true, stored: false });
        expect(await rows(t, "waitingList")).toHaveLength(1);
        expect(await auditActions(t)).toContain("waiting_list.subscribed");
    });

    it("stores the address digest, never a raw IP", async () => {
        const { t } = await bootstrap();
        const digest = await hashClientIp("secret", "203.0.113.7");

        await t.mutation(internal.publicForms.waitingList, {
            email: "ada@example.com",
            language: "it",
            ipHash: digest,
            _t: Date.now() - 10_000,
        });

        const subscriber = (await rows(t, "waitingList"))[0]!;
        expect(subscriber.ipAddress).toBe(digest);
        expect(isIpHashShaped(subscriber.ipAddress)).toBe(true);
        expect(JSON.stringify(subscriber)).not.toContain("203.0.113.7");
    });

});

// ---------------------------------------------------------------------------
// Il bridge HTTP, dal punto di vista di chi lo firma
// ---------------------------------------------------------------------------

/**
 * Il percorso completo: firma → HTTP action → mutation → riga.
 *
 * I test sopra chiamano le mutation direttamente, che è il posto giusto per il
 * *dominio*. Questi passano dalla porta che il Worker usa davvero, e verificano le
 * due cose che solo la porta può sbagliare: la firma e la forma del digest. La
 * firma si produce con il firmatario del lato Convex (`bridgeHmac`), che è lo
 * stesso spec del Worker — il ponte fra le due implementazioni è pinnato da
 * `test/migration/public-forms-bridge.test.ts`.
 */
describe("public bridge over HTTP", () => {
    /** Lo stesso valore che il deployment legge dalla propria env. */
    const secret = "public-forms-secret-under-test";

    beforeEach(() => {
        process.env.PUBLIC_FORMS_SECRET = secret;
    });

    afterEach(() => {
        delete process.env.PUBLIC_FORMS_SECRET;
    });

    const signedPost = async (
        t: Test,
        path: string,
        payload: Record<string, unknown>,
    ): Promise<Response> => {
        const signed = await signBridgeRequest({ secret, method: "POST", path, payload });
        return await t.fetch(path, {
            method: "POST",
            headers: signed.headers,
            body: signed.body,
        });
    };

    it("stores a signed message and audits it", async () => {
        const { t } = await bootstrap();

        const response = await signedPost(t, "/public/contact", {
            name: "Ada",
            email: "ada@example.com",
            subject: "Informazioni",
            message: "Vorrei saperne di più",
            language: "it",
            ipHash: await hashClientIp(secret, "203.0.113.7"),            _t: Date.now() - 10_000,
        });

        expect(response.status).toBe(200);
        expect((await response.json()) as unknown).toMatchObject({ ok: true, stored: true });
        expect(await rows(t, "contactMessages")).toHaveLength(1);
        expect(await auditActions(t)).toContain("contact.sent");
    });

    it("refuses a request that is not signed, and one signed for another path", async () => {
        const { t } = await bootstrap();
        const payload = {
            email: "ada@example.com",
            language: "it",
            ipHash: await hashClientIp(secret, "203.0.113.7"),
        };

        const unsigned = await t.fetch("/public/waiting-list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        });
        expect(unsigned.status).toBe(401);

        // Firmata per `/public/contact` e presentata a `/public/waiting-list`: la path
        // è parte del materiale firmato, quindi la firma non vale qui. È la difesa che
        // impedisce di riusare una firma captata su una rotta che il Worker non ha
        // autorizzato.
        const forContact = await signBridgeRequest({
            secret,
            method: "POST",
            path: "/public/contact",
            payload,
        });
        const retargetResponse = await t.fetch("/public/waiting-list", {
            method: "POST",
            headers: forContact.headers,
            body: forContact.body,
        });
        expect(retargetResponse.status).toBe(401);

        expect(await rows(t, "waitingList")).toHaveLength(0);
    });

    it("refuses a digest that is not a digest, before touching the domain", async () => {
        const { t } = await bootstrap();

        const response = await signedPost(t, "/public/waiting-list", {
            email: "ada@example.com",
            language: "it",
            // Un IP in chiaro, o un hash troncato/uppercase: forme che creerebbero un
            // bucket di rate limit più debole (o nessuno) invece di un rifiuto.
            ipHash: "203.0.113.7",
        });

        expect(response.status).toBe(400);
        expect((await response.json()) as unknown).toMatchObject({ code: "IP_HASH_REQUIRED" });
        expect(await rows(t, "waitingList")).toHaveLength(0);
    });

    it("subscribes once: the second signed call is an already-subscribed answer", async () => {
        const { t } = await bootstrap();
        const payload = {
            email: "ada@example.com",
            language: "it",
            ipHash: await hashClientIp(secret, "203.0.113.7"),
            _t: Date.now() - 10_000,
        };

        const first = await signedPost(t, "/public/waiting-list", payload);
        const second = await signedPost(t, "/public/waiting-list", payload);

        expect((await first.json()) as unknown).toMatchObject({
            alreadySubscribed: false,
            stored: true,
        });
        expect((await second.json()) as unknown).toMatchObject({
            alreadySubscribed: true,
            stored: false,
        });
        // Un replay della stessa richiesta firmata non crea una seconda iscrizione:
        // la dedup di dominio è ciò che rende innocuo un replay dentro la finestra.
        expect(await rows(t, "waitingList")).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Site mode
// ---------------------------------------------------------------------------

describe("site settings", () => {
    it("defaults to active and is readable without authentication", async () => {
        const { t } = await bootstrap();

        expect(await t.query(api.siteSettings.getPublic, {})).toEqual({ mode: DEFAULT_SITE_MODE });
    });

    it("accepts the four modes and collapses an unknown value to active", async () => {
        const { t, s, appUserId } = await bootstrap();
        await t.run(async (ctx) => {
            await ctx.db.patch(appUserId, { globalRole: "superAdmin" });
        });

        for (const mode of SITE_MODES) {
            const result = await s.mutation(api.siteSettings.set, { mode });
            expect(result.mode).toBe(mode);
            expect((await t.query(api.siteSettings.getPublic, {})).mode).toBe(mode);
        }

        // Un valore ignoto in tabella (typo, scrittura manuale) non diventa uno
        // stato incoerente: collassa su "active", come lo schema Zod permissivo.
        await t.run(async (ctx) => {
            const row = (await ctx.db.query("siteSettings").collect())[0]!;
            await ctx.db.patch(row._id, { value: "maintenance-readonlyy" });
        });
        expect((await t.query(api.siteSettings.getPublic, {})).mode).toBe("active");
    });

    it("requires a superAdmin and audits every change", async () => {
        const { t, s, appUserId } = await bootstrap();

        await expectCode(s.mutation(api.siteSettings.set, { mode: "maintenance" }), "SUPER_ADMIN_REQUIRED");

        await t.run(async (ctx) => {
            await ctx.db.patch(appUserId, { globalRole: "superAdmin" });
        });

        const result = await s.mutation(api.siteSettings.set, { mode: "maintenance-readonly" });
        expect(result).toEqual({ mode: "maintenance-readonly", previous: "active" });
        expect((await t.query(api.siteSettings.getPublic, {})).mode).toBe("maintenance-readonly");

        const cleared = await s.mutation(api.siteSettings.clear, {});
        expect(cleared).toMatchObject({ mode: "active", previous: "maintenance-readonly" });
        expect(await rows(t, "siteSettings")).toHaveLength(0);

        const siteAudits = (await rows(t, "auditLogs")).filter(
            (row) => row.action === "admin.site_mode_changed",
        );
        expect(siteAudits).toHaveLength(2);
        expect(siteAudits[0]!.details).toMatchObject({ from: "active", to: "maintenance-readonly" });
    });
});
