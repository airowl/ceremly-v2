import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, components, internal } from "../_generated/api";
import { DOMAIN_BATCH_VERSION, domainBatchDigest } from "../lib/domainBatchDigest";
import type { DomainImportTable } from "../lib/domainBatchDigest";
import { initConvexTestWithAuthComponent } from "../test.setup";

/**
 * Hermetic tests for the domain import (plan Task 10, Step 3).
 *
 * What they pin, in the plan's words: "Importare due volte lo stesso batch e
 * verificare count invariato; rifiutare membership senza user/org, guest senza
 * event/org coerenti, RSVP senza guest, variante senza parent e record con
 * `legacyId` duplicato."
 *
 * They run against the real Convex runtime (`convex-test`), the real validators
 * and the real auth component, so a schema or validator mistake fails here rather
 * than halfway through migrating production data.
 */

// The auth component is registered: `appUsers` profiles are linked to their
// Better Auth credential by email, so the real component has to be there.
type Test = Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>;

const MIGRATION_KEY = "test-migration-key";

beforeEach(() => {
    process.env.MIGRATION_API_KEY = MIGRATION_KEY;
});

afterEach(() => {
    delete process.env.MIGRATION_API_KEY;
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type LegacyRecord = Record<string, unknown>;

interface BatchInput {
    table: DomainImportTable;
    batchIndex?: number;
    records: LegacyRecord[];
    version?: string;
    watermark?: string;
    /** Overrides the digest, to exercise the integrity check. */
    sha256?: string;
    migrationKey?: string;
}

async function send(t: Test, input: BatchInput) {
    const envelope = {
        version: input.version ?? DOMAIN_BATCH_VERSION,
        table: input.table,
        batchIndex: input.batchIndex ?? 0,
        watermark: input.watermark,
        records: input.records,
    };
    const sha256 = input.sha256 ?? (await domainBatchDigest(envelope));

    return await t.mutation(internal.migrations.domainImport.importBatch, {
        migrationKey: input.migrationKey ?? MIGRATION_KEY,
        table: input.table,
        batchIndex: envelope.batchIndex,
        version: envelope.version,
        ...(envelope.watermark ? { watermark: envelope.watermark } : {}),
        records: input.records,
        sha256,
    });
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

/** Row count of a table whose name is only known at runtime. */
const count = (t: Test, table: string) =>
    t.run(async (c) => {
        const db = c.db as unknown as {
            query(name: string): { collect(): Promise<unknown[]> };
        };
        return (await db.query(table).collect()).length;
    });

/**
 * A Better Auth user, created through the component adapter — the same door the
 * domain import uses to link an `appUsers` profile to its credential.
 */
async function createAuthUser(t: Test, email: string, name = "User"): Promise<string> {
    // The component's adapter takes `{ input: { model, data } }` and returns the
    // raw document: `_id` (not the `id` the higher-level Better Auth adapter
    // projects) is the Convex JWT subject, i.e. what `appUsers.authUserId` holds.
    const created = (await t.mutation(components.betterAuth.adapter.create, {
        input: {
            model: "user",
            data: {
                name,
                email,
                emailVerified: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        },
    })) as { id?: string; _id?: string };

    const id = created.id ?? created._id;
    if (!id) throw new Error("the auth component returned no user id");
    return id;
}

/** Provisioned application profile, as a user gets on first login. */
async function seedProfile(t: Test, subject: string) {
    const session = t.withIdentity({
        subject,
        email: `${subject}@example.com`,
        name: subject,
    });
    const provisioned = (await session.mutation(api.organizations.ensureProvisioned, {})) as {
        organizationId: string;
    };

    await createAuthUser(t, `${subject}@example.com`, subject);
    return provisioned.organizationId;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const legacyUser = (id: string, subject: string) => ({
    id,
    email: `${subject}@example.com`,
    role: "user",
    locale: "it",
});

const legacyOrganization = (id: string, slug: string) => ({
    id,
    name: `Org ${slug}`,
    slug,
    createdAt: "2026-01-02T03:04:05.000Z",
});

const legacyEvent = (id: string, organizationId: string, slug: string) => ({
    id,
    organizationId,
    type: "matrimonio",
    templateKey: "toscana-basic",
    title: `Evento ${slug}`,
    slug,
    status: "draft",
    blocks: [],
    rsvpConfig: [],
    distribution: {},
    tier: "free",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
});

const legacyGuest = (id: string, organizationId: string, eventId: string, token: string) => ({
    id,
    organizationId,
    eventId,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "Ada@Example.com",
    token,
    openCount: 0,
    remindersDisabled: false,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
});

const legacyFile = (
    id: string,
    organizationId: string | null,
    path: string,
    extra: LegacyRecord = {},
) => ({
    id,
    organizationId,
    originalName: path.slice(path.lastIndexOf("/") + 1),
    mimeType: "image/png",
    fileType: "image",
    size: 1024,
    path,
    isPublic: true,
    isActive: true,
    uploadStatus: "active",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...extra,
});

// ---------------------------------------------------------------------------
// 1. Integrity and access to the entry point
// ---------------------------------------------------------------------------

describe("importBatch integrity", () => {
    it("refuses a batch whose digest does not match the records", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, {
                table: "organizations",
                records: [legacyOrganization("org-1", "acme")],
                sha256: "0".repeat(64),
            }),
            "BATCH_DIGEST_MISMATCH",
        );

        // The whole batch is one transaction: a rejected digest writes nothing,
        // including the journal row a later run would read as "imported".
        expect(await count(t, "organizations")).toBe(0);
        expect(await count(t, "migrationRecords")).toBe(0);
    });

    it("refuses a batch edited after the digest was computed", async () => {
        const t = await initConvexTestWithAuthComponent();
        const records = [legacyOrganization("org-1", "acme")];
        const sha256 = await domainBatchDigest({
            version: DOMAIN_BATCH_VERSION,
            table: "organizations",
            batchIndex: 0,
            records,
        });

        // Same digest, one extra record: the export was edited in transit.
        await expectCode(
            send(t, {
                table: "organizations",
                records: [...records, legacyOrganization("org-2", "globex")],
                sha256,
            }),
            "BATCH_DIGEST_MISMATCH",
        );
    });

    it("refuses a batch with the wrong key, and one when no key is configured", async () => {
        const t = await initConvexTestWithAuthComponent();
        const records = [legacyOrganization("org-1", "acme")];

        await expectCode(
            send(t, { table: "organizations", records, migrationKey: "wrong-key" }),
            "INVALID_MIGRATION_KEY",
        );

        delete process.env.MIGRATION_API_KEY;
        await expectCode(
            send(t, { table: "organizations", records }),
            "MIGRATION_KEY_NOT_CONFIGURED",
        );
    });

    it("refuses a table that is not part of the migration", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, { table: "siteSettings" as DomainImportTable, records: [] }),
            "UNKNOWN_IMPORT_TABLE",
        );
    });
});

// ---------------------------------------------------------------------------
// 2. Idempotency
// ---------------------------------------------------------------------------

describe("idempotency", () => {
    it("imports a batch once and replays it as a no-op", async () => {
        const t = await initConvexTestWithAuthComponent();
        const records = [
            legacyOrganization("org-1", "acme"),
            legacyOrganization("org-2", "globex"),
        ];

        const first = await send(t, { table: "organizations", records });
        expect(first.imported).toBe(2);
        expect(first.skipped).toBe(0);
        expect(first.replayed).toBe(false);

        const second = await send(t, { table: "organizations", records });
        expect(second.imported).toBe(0);
        expect(second.skipped).toBe(2);
        expect(second.replayed).toBe(true);

        expect(await count(t, "organizations")).toBe(2);
        // ...and the journal keeps both runs: a re-run is visible, not silent.
        expect(await count(t, "migrationRecords")).toBe(2);
    });

    it("does not duplicate rows when the batch is re-cut with a later watermark", async () => {
        const t = await initConvexTestWithAuthComponent();
        const records = [legacyOrganization("org-1", "acme")];

        await send(t, { table: "organizations", records, watermark: "2026-01-01" });
        // Same records, new batch index and watermark: the natural key — here the
        // slug the legacy schema declared UNIQUE — is what makes the import
        // idempotent, not the watermark.
        const second = await send(t, {
            table: "organizations",
            batchIndex: 1,
            watermark: "2026-06-01",
            records,
        });

        expect(second.imported).toBe(0);
        expect(second.replayed).toBe(false);
        expect(await count(t, "organizations")).toBe(1);
    });

    it("adopts an already-provisioned profile instead of shadowing it", async () => {
        const t = await initConvexTestWithAuthComponent();

        // Someone who signed up after the cutover already has an `appUsers` row
        // with a live Better Auth id.
        await seedProfile(t, "early");

        const result = await send(t, {
            table: "appUsers",
            records: [legacyUser("legacy-1", "early")],
        });

        expect(result.skipped).toBe(1);
        expect(await count(t, "appUsers")).toBe(1);

        const appUser = await t.run(async (c) => await c.db.query("appUsers").first());
        expect(appUser?.legacyId).toBe("legacy-1");
    });

    it("refuses a profile whose credential was never imported", async () => {
        const t = await initConvexTestWithAuthComponent();

        // No component user for this address: the profile would point at an
        // identity that does not exist.
        await expectCode(
            send(t, { table: "appUsers", records: [legacyUser("legacy-1", "ghost")] }),
            "AUTH_USER_NOT_IMPORTED",
        );
    });
});

// ---------------------------------------------------------------------------
// 3. Topological order
// ---------------------------------------------------------------------------

describe("topological order", () => {
    it("refuses a batch whose referenced table has not been imported", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, {
                table: "guests",
                records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
            }),
            "IMPORT_ORDER_VIOLATION",
        );
    });

    it("accepts the same batch once its prerequisites are journalled", async () => {
        const t = await initConvexTestWithAuthComponent();

        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "events", records: [legacyEvent("event-1", "org-1", "nozze")] });

        const result = await send(t, {
            table: "guests",
            records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
        });

        expect(result.imported).toBe(1);
    });

    it("requires an empty prerequisite batch to be sent as well", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        // Organizations are imported but `events` never was: the import stops
        // instead of writing a guest whose event is missing.
        await expectCode(
            send(t, {
                table: "guests",
                records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
            }),
            "IMPORT_ORDER_VIOLATION",
        );

        // An empty batch is enough to prove the prerequisite was handled; the
        // record then fails on the reference itself, not on the order.
        await send(t, { table: "events", records: [] });
        await expectCode(
            send(t, {
                table: "guests",
                records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
            }),
            "UNRESOLVED_REFERENCE",
        );
    });
});

// ---------------------------------------------------------------------------
// 4. Logical foreign keys
// ---------------------------------------------------------------------------

describe("logical foreign keys", () => {
    it("rejects a guest whose event does not exist", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "events", records: [] });

        await expectCode(
            send(t, {
                table: "guests",
                records: [legacyGuest("guest-1", "org-1", "ghost-event", "tok1")],
            }),
            "UNRESOLVED_REFERENCE",
        );
    });

    it("rejects a membership without its user", async () => {
        const t = await initConvexTestWithAuthComponent();

        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "appUsers", records: [] });

        await expectCode(
            send(t, {
                table: "memberships",
                records: [
                    {
                        id: "member-1",
                        organizationId: "org-1",
                        userId: "ghost",
                        role: "owner",
                        createdAt: "2026-05-01T00:00:00.000Z",
                    },
                ],
            }),
            "UNRESOLVED_REFERENCE",
        );
    });

    it("rejects an RSVP without its guest", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "events", records: [legacyEvent("event-1", "org-1", "nozze")] });
        await send(t, { table: "guests", records: [] });

        await expectCode(
            send(t, {
                table: "rsvpResponses",
                records: [
                    {
                        id: "rsvp-1",
                        organizationId: "org-1",
                        eventId: "event-1",
                        guestId: "ghost",
                        attending: "yes",
                        companionsCount: 0,
                        answers: {},
                        submittedAt: "2026-04-01T00:00:00.000Z",
                        updatedAt: "2026-04-02T00:00:00.000Z",
                    },
                ],
            }),
            "UNRESOLVED_REFERENCE",
        );
    });

    it("rejects a variant whose parent file was not exported", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        await expectCode(
            send(t, {
                table: "files",
                records: [
                    legacyFile("variant-1", "org-1", "global/2026-03/parent/thumb.webp", {
                        variantOf: "parent-that-was-not-exported",
                    }),
                ],
            }),
            "UNRESOLVED_REFERENCE",
        );
    });

    it("resolves a variant against its parent inside the same batch", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        const result = await send(t, {
            table: "files",
            records: [
                legacyFile("parent-1", "org-1", "global/2026-03/abc/original.png", {
                    variantsGeneratedAt: "2026-03-02T00:00:00.000Z",
                }),
                legacyFile("variant-1", "org-1", "global/2026-03/abc/thumb.webp", {
                    variantOf: "parent-1",
                    variantType: "thumb",
                    mimeType: "image/webp",
                }),
                // An image whose variants were never generated: the migration says
                // so (`pending`), which is what puts it in the retry sweep instead
                // of leaving it looking finished.
                legacyFile("parent-2", "org-1", "global/2026-03/def/original.png"),
            ],
        });

        expect(result.imported).toBe(3);

        const rows = await t.run(async (c) => await c.db.query("files").collect());
        const parent = rows.find((row) => row.legacyId === "parent-1");
        const variant = rows.find((row) => row.legacyId === "variant-1");
        const pending = rows.find((row) => row.legacyId === "parent-2");

        expect(variant?.variantOf).toBe(parent?._id);
        // Task 7's layout, derived from the legacy key: a migrated object sits
        // exactly where the app already expects it.
        expect(parent?.basePath).toBe("global/2026-03/abc");
        expect(variant?.basePath).toBe("global/2026-03/abc");
        expect(parent?.variantStatus).toBe("ready");
        expect(pending?.variantStatus).toBe("pending");
        expect(variant?.variantStatus).toBe("none");
        expect(variant?.variantType).toBe("thumb");
    });
});

// ---------------------------------------------------------------------------
// 5. Tenant coherence
// ---------------------------------------------------------------------------

describe("tenant coherence", () => {
    it("rejects a guest whose organization differs from its event's", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, {
            table: "organizations",
            records: [legacyOrganization("org-1", "acme"), legacyOrganization("org-2", "globex")],
        });
        await send(t, { table: "events", records: [legacyEvent("event-1", "org-1", "nozze")] });

        await expectCode(
            send(t, {
                table: "guests",
                // Written under another tenant: migrating it as-is would make the
                // event's guest list reachable from two organizations.
                records: [legacyGuest("guest-1", "org-2", "event-1", "tok1")],
            }),
            "INCOHERENT_TENANT_REFERENCE",
        );
        expect(await count(t, "guests")).toBe(0);
    });

    it("rejects an RSVP whose guest belongs to another event", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, {
            table: "events",
            records: [
                legacyEvent("event-1", "org-1", "nozze"),
                legacyEvent("event-2", "org-1", "battesimo"),
            ],
        });
        await send(t, {
            table: "guests",
            records: [legacyGuest("guest-1", "org-1", "event-2", "tok1")],
        });

        await expectCode(
            send(t, {
                table: "rsvpResponses",
                records: [
                    {
                        id: "rsvp-1",
                        organizationId: "org-1",
                        eventId: "event-1",
                        guestId: "guest-1",
                        attending: "yes",
                        companionsCount: 0,
                        answers: {},
                        submittedAt: "2026-04-01T00:00:00.000Z",
                        updatedAt: "2026-04-02T00:00:00.000Z",
                    },
                ],
            }),
            "INCOHERENT_TENANT_REFERENCE",
        );
    });
});

// ---------------------------------------------------------------------------
// 6. Record validation
// ---------------------------------------------------------------------------

describe("record validation", () => {
    it("rejects a duplicate legacy id inside one batch", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, {
                table: "organizations",
                records: [
                    legacyOrganization("org-1", "acme"),
                    legacyOrganization("org-1", "globex"),
                ],
            }),
            "DUPLICATE_LEGACY_ID",
        );
    });

    it("rejects a record without a legacy id", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, { table: "organizations", records: [{ name: "No id", slug: "no-id" }] }),
            "INVALID_DOMAIN_IMPORT_RECORD",
        );
    });

    it("rejects a record missing a NOT NULL column", async () => {
        const t = await initConvexTestWithAuthComponent();

        await expectCode(
            send(t, { table: "organizations", records: [{ id: "org-1", name: "No slug" }] }),
            "INVALID_DOMAIN_IMPORT_RECORD",
        );
    });

    it("rejects an invite block that does not match the shared shape", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        // The legacy column was typed only in TypeScript: this exact payload was
        // storable before, and would have failed at render time instead.
        await expect(
            send(t, {
                table: "events",
                records: [
                    {
                        ...legacyEvent("event-1", "org-1", "nozze"),
                        blocks: [{ id: "b_1", type: "header", data: { eyebrow: "Ciao" } }],
                    },
                ],
            }),
        ).rejects.toThrow();
    });

    it("accepts a valid invitation content payload", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        const result = await send(t, {
            table: "events",
            records: [
                {
                    ...legacyEvent("event-1", "org-1", "nozze"),
                    theme: {
                        paper: "#FFFFFF",
                        accent: "#d4a373",
                        deep: "#5E4426",
                        onAccent: "#3F3622",
                    },
                    blocks: [
                        {
                            id: "b_header",
                            type: "header",
                            data: {
                                eyebrow: "Ci sposiamo",
                                intro: "Vi aspettiamo",
                                names: ["Ada", "Charles"],
                                dateText: "12 settembre",
                                timeText: "16:00",
                            },
                        },
                        { id: "b_rsvp", type: "rsvp", data: { buttonLabel: "Confermo" } },
                    ],
                    rsvpConfig: [
                        {
                            id: "attendance",
                            label: "Partecipi?",
                            type: "single",
                            options: ["Sì", "No"],
                            required: true,
                            perPerson: false,
                            locked: true,
                        },
                    ],
                    distribution: { emailSubject: "Invito", senderName: "Ada" },
                },
            ],
        });

        expect(result.imported).toBe(1);
    });

    it("stores an RSVP answer map and a per-person answer", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "events", records: [legacyEvent("event-1", "org-1", "nozze")] });
        await send(t, {
            table: "guests",
            records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
        });

        const result = await send(t, {
            table: "rsvpResponses",
            records: [
                {
                    id: "rsvp-1",
                    organizationId: "org-1",
                    eventId: "event-1",
                    guestId: "guest-1",
                    attending: "yes",
                    companionsCount: 2,
                    answers: {
                        attendance: "yes",
                        companions_count: 2,
                        dietary: ["vegetariano"],
                        per_person: { self: "pesce", companions: ["carne", "pesce"] },
                        numbers: 4,
                        boolean: true,
                    },
                    declineMessage: null,
                    submittedAt: "2026-04-01T00:00:00.000Z",
                    updatedAt: "2026-04-02T00:00:00.000Z",
                },
            ],
        });

        expect(result.imported).toBe(1);

        const row = await t.run(async (c) => await c.db.query("rsvpResponses").first());
        expect(row?.answers.per_person).toEqual({ self: "pesce", companions: ["carne", "pesce"] });
        expect(row?.declineMessage).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// 7. Reporting: nothing is dropped silently
// ---------------------------------------------------------------------------

describe("reporting", () => {
    it("names the legacy columns it cannot store", async () => {
        const t = await initConvexTestWithAuthComponent();
        await createAuthUser(t, "auth_owner@example.com", "auth_owner");

        const result = await send(t, {
            table: "appUsers",
            records: [
                {
                    ...legacyUser("legacy-1", "auth_owner"),
                    banned: true,
                    phone: "+390000000000",
                    unknownFutureColumn: "surprise",
                },
            ],
        });

        expect(result.imported).toBe(1);
        expect(result.ignoredColumns).toContain("phone");
        expect(result.ignoredColumns).toContain("banned");
        // A column the spec does not know at all is schema drift: reported, not
        // copied and not swallowed.
        expect(result.unknownColumns).toContain("unknownFutureColumn");
    });

    it("counts best-effort references that could not be resolved", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        // Both prerequisites are journalled — empty, exactly as the export does
        // for a table with no rows. That is what makes a dangling reference here
        // mean "the parent is gone", not "the parent was never imported".
        await send(t, { table: "events", records: [] });
        await send(t, { table: "guests", records: [] });

        const result = await send(t, {
            table: "emailEvents",
            records: [
                {
                    id: "email-1",
                    messageId: "msg-1",
                    type: "delivered",
                    recipient: "ada@example.com",
                    guestId: "guest-that-no-longer-exists",
                    createdAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        expect(result.imported).toBe(1);
        expect(result.danglingRefs).toEqual([
            { field: "guestId", table: "guests", legacyId: "guest-that-no-longer-exists" },
        ]);

        const row = await t.run(async (c) => await c.db.query("emailEvents").first());
        expect(row?.guestId).toBeUndefined();
    });

    it("defers a pending invitation and imports the terminal ones", async () => {
        const t = await initConvexTestWithAuthComponent();
        await createAuthUser(t, "auth_owner@example.com", "auth_owner");
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "appUsers", records: [legacyUser("legacy-1", "auth_owner")] });

        const base = {
            organizationId: "org-1",
            email: "guest@example.com",
            role: "member",
            inviterId: "legacy-1",
            expiresAt: "2026-12-31T00:00:00.000Z",
            createdAt: "2026-06-01T00:00:00.000Z",
        };

        const result = await send(t, {
            table: "invitations",
            records: [
                { id: "inv-pending", status: "pending", ...base },
                { id: "inv-accepted", status: "accepted", ...base },
                { id: "inv-canceled", status: "canceled", ...base },
            ],
        });

        expect(result.imported).toBe(2);
        // The legacy `invitation` table has no token column: a pending invitation
        // cannot be migrated, and inventing a token hash would create a credential
        // nobody was ever sent.
        expect(result.deferred).toEqual({ pendingInvitation: 1 });

        const rows = await t.run(async (c) => await c.db.query("invitations").collect());
        expect(rows.map((row) => row.status).sort()).toEqual(["accepted", "canceled"]);
        expect(rows.every((row) => row.tokenHash === undefined)).toBe(true);
    });

    it("defers a file that has no organization", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });

        const result = await send(t, {
            table: "files",
            records: [legacyFile("global-file", null, "global/2025-01/xyz/original.png")],
        });

        expect(result.imported).toBe(0);
        expect(result.deferred).toEqual({ globalFileWithoutOrganization: 1 });
    });

    it("journals an empty batch, which is what proves the order", async () => {
        const t = await initConvexTestWithAuthComponent();

        const result = await send(t, { table: "guests", records: [] });

        expect(result.records).toBe(0);
        expect(result.imported).toBe(0);
        expect(await count(t, "migrationRecords")).toBe(1);
    });

    it("keeps the guest email normalized, as the legacy unique index compared it", async () => {
        const t = await initConvexTestWithAuthComponent();
        await send(t, { table: "organizations", records: [legacyOrganization("org-1", "acme")] });
        await send(t, { table: "events", records: [legacyEvent("event-1", "org-1", "nozze")] });

        await send(t, {
            table: "guests",
            records: [legacyGuest("guest-1", "org-1", "event-1", "tok1")],
        });

        const guest = await t.run(async (c) => await c.db.query("guests").first());
        expect(guest?.email).toBe("ada@example.com");
    });
});
