import { describe, expect, it } from "vitest";

import {
    canonicalChecksum,
    reconcileAuth,
    reconcileBilling,
    reconcileDomainTable,
    legacyBillingState,
    reconcileManifest,
    reconcileR2Bucket,
    reconciliationExitCode,
    sha256Secret,
    type AuthSourceState,
    type AuthTargetState,
} from "../../scripts/migration/reconcile";
import { compareBillingStates } from "../../scripts/migration/reconcile-creem";
import type { ExportManifest } from "../../scripts/migration/types";
import { listAllObjects, parseListObjectsV2, type BucketLister } from "../../scripts/migration/r2-bucket";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import convexSchema from "../../convex/schema";
import * as legacySchema from "../../server/database/schema";
import {
    IMPORTED_CONVEX_TABLES,
    SOURCE_INVENTORY,
    TARGET_ONLY_INVENTORY,
} from "../../scripts/migration/inventory";

/**
 * Plan Task 16, Step 4: `reconcile.ts` compares count/checksum, logical
 * references, the R2 manifest, plans/limits and Creem, and its exit code is `1`
 * on **any** mismatch. The comparator is pure; these cases pin its verdicts.
 *
 * Source records have the legacy wire shape (what `export-neon.ts` puts in a
 * batch: camelCase columns, ISO timestamps). Target documents have the Convex
 * shape (`_id`, `legacyId`, epoch ms, Convex ids in reference fields).
 */

const ORG = "0199a000-0000-7000-8000-000000000001";
const EVENT = "0199a000-0000-7000-8000-000000000002";
const OTHER_EVENT = "0199a000-0000-7000-8000-000000000003";
const GUEST = "0199a000-0000-7000-8000-000000000004";

/** Convex id → legacy id, as `reconcile.ts` builds it from the parent tables. */
const legacyIds = new Map<string, string>([
    ["k_org", ORG],
    ["k_event", EVENT],
    ["k_other_event", OTHER_EVENT],
]);
const legacyIdOf = (id: string) => legacyIds.get(id);

const sourceGuest = (overrides: Record<string, unknown> = {}) => ({
    id: GUEST,
    organizationId: ORG,
    eventId: EVENT,
    firstName: "Anna",
    lastName: "Rossi",
    email: "Anna.Rossi@Example.com",
    phone: null,
    token: "tok_guest_1",
    openCount: 2,
    remindersDisabled: false,
    sentAt: "2026-09-01T10:00:00.000Z",
    removedAt: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
});

const targetGuest = (overrides: Record<string, unknown> = {}) => ({
    _id: "k_guest",
    _creationTime: 1,
    legacyId: GUEST,
    organizationId: "k_org",
    eventId: "k_event",
    firstName: "Anna",
    lastName: "Rossi",
    email: "anna.rossi@example.com",
    token: "tok_guest_1",
    openCount: 2,
    remindersDisabled: false,
    sentAt: Date.parse("2026-09-01T10:00:00.000Z"),
    createdAt: Date.parse("2026-08-01T10:00:00.000Z"),
    updatedAt: Date.parse("2026-09-01T10:00:00.000Z"),
    ...overrides,
});

describe("domain tables", () => {
    it("matches a faithfully imported row: timestamps as epoch, email normalized, refs by legacy id", () => {
        const result = reconcileDomainTable("guests", [sourceGuest()], [targetGuest()], legacyIdOf);

        expect(result.mismatches).toEqual([]);
        expect(result.sourceCount).toBe(1);
        expect(result.targetCount).toBe(1);
        expect(result.sourceChecksum).toBe(result.targetChecksum);
        expect(reconciliationExitCode([result])).toBe(0);
    });

    it("flags a source row missing from the target", () => {
        const result = reconcileDomainTable("guests", [sourceGuest()], [], legacyIdOf);

        expect(result.mismatches).toEqual([`missing_in_target:${GUEST}`]);
        expect(reconciliationExitCode([result])).toBe(1);
    });

    it("flags a migrated target row whose source row no longer exists", () => {
        const result = reconcileDomainTable("guests", [], [targetGuest()], legacyIdOf);

        expect(result.mismatches).toEqual([`orphan_in_target:${GUEST}`]);
    });

    it("ignores target rows that were never migrated (no legacyId)", () => {
        const native = targetGuest({ legacyId: undefined, _id: "k_native" });
        const result = reconcileDomainTable("guests", [sourceGuest()], [targetGuest(), native], legacyIdOf);

        expect(result.mismatches).toEqual([]);
        expect(result.targetCount).toBe(1);
    });

    it("names the differing field but never prints its value", () => {
        const result = reconcileDomainTable(
            "guests",
            [sourceGuest()],
            [targetGuest({ lastName: "Bianchi" })],
            legacyIdOf,
        );

        expect(result.mismatches).toEqual([`field_mismatch:${GUEST}:lastName`]);
        expect(result.mismatches.join(" ")).not.toContain("Bianchi");
        expect(result.mismatches.join(" ")).not.toContain("Rossi");
        expect(result.sourceChecksum).not.toBe(result.targetChecksum);
    });

    it("flags a field present on one side only (a null that became a value, or the reverse)", () => {
        const result = reconcileDomainTable(
            "guests",
            [sourceGuest({ removedAt: "2026-09-10T00:00:00.000Z" })],
            [targetGuest()],
            legacyIdOf,
        );

        expect(result.mismatches).toEqual([`field_mismatch:${GUEST}:removedAt`]);
    });

    it("flags a reference that points at another parent (logical reference check)", () => {
        const result = reconcileDomainTable(
            "guests",
            [sourceGuest()],
            [targetGuest({ eventId: "k_other_event" })],
            legacyIdOf,
        );

        expect(result.mismatches).toEqual([`field_mismatch:${GUEST}:eventId`]);
    });

    it("flags a reference whose target parent is not a migrated row", () => {
        const result = reconcileDomainTable(
            "guests",
            [sourceGuest()],
            [targetGuest({ eventId: "k_unknown" })],
            legacyIdOf,
        );

        expect(result.mismatches).toContain(`dangling_ref:${GUEST}:eventId`);
    });

    it("leaves deferred records out of the comparison instead of failing on them", () => {
        const pending = {
            id: "inv-1",
            organizationId: ORG,
            inviterId: "user-1",
            email: "x@example.com",
            role: "member",
            status: "pending",
            expiresAt: "2026-10-01T00:00:00.000Z",
            createdAt: "2026-09-01T00:00:00.000Z",
        };
        const result = reconcileDomainTable("invitations", [pending], [], legacyIdOf);

        expect(result.mismatches).toEqual([]);
        expect(result.sourceCount).toBe(0);
        expect(result.deferred).toBe(1);
    });

    it("compares the R2 manifest columns of a file (path, size, digest)", () => {
        const source = {
            id: "file-1",
            organizationId: ORG,
            originalName: "a.jpg",
            fileName: "a.jpg",
            mimeType: "image/jpeg",
            fileType: "image",
            size: 1234,
            path: "org/x/a.jpg",
            url: null,
            isPublic: true,
            isActive: true,
            uploadStatus: "completed",
            sha256: "d".repeat(64),
            storageProvider: "r2",
            variantType: "original",
            variantOf: null,
            variantsGeneratedAt: null,
            uploadedBy: null,
            presignExpiresAt: null,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
        };
        const target = {
            _id: "k_file",
            legacyId: "file-1",
            organizationId: "k_org",
            originalName: "a.jpg",
            mimeType: "image/jpeg",
            fileType: "image",
            size: 1234,
            path: "org/x/a.jpg",
            isPublic: true,
            isActive: true,
            uploadStatus: "completed",
            sha256: "d".repeat(64),
            basePath: "org/x",
            variantType: "original",
            variantStatus: "pending",
            variantAttempts: 0,
            createdAt: Date.parse("2026-09-01T00:00:00.000Z"),
            updatedAt: Date.parse("2026-09-01T00:00:00.000Z"),
        };

        expect(reconcileDomainTable("files", [source], [target], legacyIdOf).mismatches).toEqual([]);
        expect(
            reconcileDomainTable("files", [source], [{ ...target, size: 99 }], legacyIdOf).mismatches,
        ).toEqual(["field_mismatch:file-1:size"]);
    });
});

describe("checksum", () => {
    it("does not depend on row order or key order", () => {
        const a = [{ legacyId: "1", values: { b: 1, a: 2 } }, { legacyId: "2", values: { x: "y" } }];
        const b = [{ legacyId: "2", values: { x: "y" } }, { legacyId: "1", values: { a: 2, b: 1 } }];

        expect(canonicalChecksum(a)).toBe(canonicalChecksum(b));
        expect(canonicalChecksum(a)).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("auth (Better Auth component)", () => {
    const source = (): AuthSourceState => ({
        users: [
            {
                id: "legacy-user-1",
                email: "Gate.User@example.com",
                name: "Gate",
                emailVerified: true,
                twoFactorEnabled: true,
                createdAt: "2026-09-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
            },
        ],
        accounts: [
            {
                id: "legacy-account-1",
                userId: "legacy-user-1",
                providerId: "credential",
                accountId: "legacy-user-1",
                password: "$scrypt$hash",
                createdAt: "2026-09-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
            },
        ],
        twoFactors: [
            { id: "tf-1", userId: "legacy-user-1", secret: "cipher-secret", backupCodes: "cipher-codes" },
        ],
    });

    const target = (): AuthTargetState => ({
        users: [
            {
                id: "ba_user_1",
                email: "gate.user@example.com",
                name: "Gate",
                emailVerified: true,
                twoFactorEnabled: true,
                createdAt: Date.parse("2026-09-01T00:00:00.000Z"),
            },
            // Signed up on the new stack: not a mismatch, only a note.
            { id: "ba_user_2", email: "new@example.com", name: "New", emailVerified: false, twoFactorEnabled: null, createdAt: 1 },
        ],
        accounts: [
            {
                userId: "ba_user_1",
                providerId: "credential",
                accountId: "legacy-user-1",
                passwordSha256: sha256Secret("$scrypt$hash"),
            },
        ],
        twoFactors: [
            {
                userId: "ba_user_1",
                secretSha256: sha256Secret("cipher-secret"),
                backupCodesSha256: sha256Secret("cipher-codes"),
            },
        ],
    });

    it("matches imported credentials by digest, without ever holding target secrets", () => {
        const results = reconcileAuth(source(), target());

        expect(results.map((result) => result.table)).toEqual(["auth_user", "auth_account", "auth_two_factor"]);
        expect(results.flatMap((result) => result.mismatches)).toEqual([]);
        expect(reconciliationExitCode(results)).toBe(0);
        expect(results[0]!.notes).toEqual(["only_in_target:1"]);
    });

    it("fails when a password hash did not survive", () => {
        const drifted = target();
        drifted.accounts[0]!.passwordSha256 = sha256Secret("$scrypt$other");
        const results = reconcileAuth(source(), drifted);

        expect(results[1]!.mismatches).toEqual(["field_mismatch:legacy-account-1:passwordSha256"]);
        expect(JSON.stringify(results)).not.toContain("$scrypt$");
        expect(reconciliationExitCode(results)).toBe(1);
    });

    it("fails when a 2FA secret or a user is missing", () => {
        const drifted = target();
        drifted.twoFactors = [];
        drifted.users = drifted.users.slice(1);
        const results = reconcileAuth(source(), drifted);

        expect(results[0]!.mismatches).toEqual(["missing_in_target:legacy-user-1"]);
        expect(results[2]!.mismatches).toEqual(["missing_in_target:tf-1"]);
        // Never the address: subjects are legacy ids.
        expect(JSON.stringify(results)).not.toContain("example.com");
    });
});

describe("manifest", () => {
    const manifest = (): ExportManifest => ({
        format: "CEREMLY-MIGRATION-V1",
        version: "2026-09-15",
        mode: "full",
        watermark: "2026-09-24T10:00:00.000Z",
        since: null,
        schemaVersion: { migrations: 12, lastHash: "h" },
        sourceEndpoint: "ep-test",
        createdAt: "2026-09-24T10:00:01.000Z",
        mac: "",
        tables: [
            {
                source: "guests",
                table: "guests",
                dataClass: "production",
                disposition: "imported",
                sourceCount: 2,
                sourceChecksum: "a".repeat(64),
                exportedCount: 2,
                batches: [],
            },
        ],
    });

    it("passes when the live source still matches the export watermark", () => {
        const result = reconcileManifest(manifest(), { guests: { count: 2, checksum: "a".repeat(64) } });

        expect(result.mismatches).toEqual([]);
    });

    it("fails when the source changed after the watermark (maintenance breach)", () => {
        const result = reconcileManifest(manifest(), { guests: { count: 3, checksum: "b".repeat(64) } });

        expect(result.mismatches).toEqual(["source_changed_after_export:guests"]);
        expect(reconciliationExitCode([result])).toBe(1);
    });
});

describe("billing (Creem) and exit code", () => {
    it("turns every Creem mismatch into a failing result", () => {
        const report = compareBillingStates(
            {
                subscriptions: [],
                events: [
                    {
                        legacyId: EVENT,
                        organizationLegacyId: ORG,
                        tier: "celebration",
                        creemOrderId: "order_1",
                        creemCheckoutId: null,
                    },
                ],
            },
            { configured: [], organizations: [{ id: "k_org", legacyId: ORG, customerId: null }], subscriptions: [], events: [] },
        );
        const result = reconcileBilling(report);

        expect(result.table).toBe("creem_billing");
        expect(result.mismatches).toEqual([`event_missing_in_convex:${EVENT}`]);
        expect(reconciliationExitCode([result])).toBe(1);
    });

    it("is 1 when any single table disagrees, 0 only when none does", () => {
        const ok = reconcileDomainTable("guests", [sourceGuest()], [targetGuest()], legacyIdOf);
        const bad = reconcileDomainTable("guests", [sourceGuest()], [], legacyIdOf);

        expect(reconciliationExitCode([ok, ok])).toBe(0);
        expect(reconciliationExitCode([ok, bad, ok])).toBe(1);
        expect(reconciliationExitCode([])).toBe(1);
    });
});

describe("inventory (Step 2)", () => {
    it("classifies every legacy Postgres table", () => {
        const legacyTables = Object.values(legacySchema)
            .filter((value) => is(value, PgTable))
            .map((table) => getTableConfig(table as PgTable).name)
            .sort();
        const classified = new Set(SOURCE_INVENTORY.map((entry) => entry.table));

        expect(legacyTables.filter((table) => !classified.has(table))).toEqual([]);
    });

    it("classifies every Convex table, as imported or target-only with a reason", () => {
        const convexTables = Object.keys((convexSchema as unknown as { tables: Record<string, unknown> }).tables).sort();
        const covered = new Set<string>([...IMPORTED_CONVEX_TABLES, ...TARGET_ONLY_INVENTORY.map((entry) => entry.table)]);

        expect(convexTables.filter((table) => !covered.has(table))).toEqual([]);
        for (const entry of TARGET_ONLY_INVENTORY) expect(entry.reason.length, entry.table).toBeGreaterThan(10);
    });

    it("pins the plan's classes: sessions/verification ephemeral, R2 manifest-only, auth/domain/audit imported", () => {
        const byTable = new Map(SOURCE_INVENTORY.map((entry) => [entry.table, entry]));

        for (const table of ["session", "verification"]) {
            expect(byTable.get(table)).toMatchObject({ dataClass: "ephemeral", disposition: "not-imported" });
        }
        expect(byTable.get("r2:objects")).toMatchObject({ dataClass: "production", disposition: "manifest-only" });
        for (const table of ["user", "account", "two_factor", "organization", "member", "events", "guests", "audit_log"]) {
            expect(byTable.get(table), table).toMatchObject({ dataClass: "production", disposition: "imported" });
        }
    });
});

describe("Task 16 fix round 1", () => {
    it("exit code fails on a count or checksum difference even without row mismatches", () => {
        const base = { table: "t", sourceCount: 1, targetCount: 1, sourceChecksum: "a", targetChecksum: "a", mismatches: [] };

        expect(reconciliationExitCode([base])).toBe(0);
        expect(reconciliationExitCode([{ ...base, targetCount: 2 }])).toBe(1);
        expect(reconciliationExitCode([{ ...base, targetChecksum: "b" }])).toBe(1);
    });

    const file = (id: string, path: string, size: number) => ({
        id,
        organizationId: ORG,
        path,
        size,
        originalName: "x.jpg",
        mimeType: "image/jpeg",
        fileType: "image",
        isPublic: true,
        isActive: true,
        uploadStatus: "completed",
    });

    /** Fake `ListObjectsV2` over a fixed key set, two keys per page. */
    const fakeLister = (objects: Array<{ key: string; size: number }>): BucketLister => ({
        async list(token) {
            const start = token ? Number(token) : 0;
            const page = objects.slice(start, start + 2).map((object) => ({ ...object, etag: "e" }));
            return { objects: page, nextToken: start + 2 < objects.length ? String(start + 2) : null };
        },
    });

    it("inventories the bucket: missing, extra and size-mismatched objects fail", async () => {
        const rows = [file("f1", "evt/e1/2026-09/f1/a.jpg", 10), file("f2", "evt/e1/2026-09/f2/b.jpg", 20)];
        const objects = await listAllObjects(fakeLister([
            { key: "evt/e1/2026-09/f1/a.jpg", size: 10 },
            { key: "evt/e1/2026-09/f2/b.jpg", size: 20 },
            { key: "exports/u/2026-09/x.json", size: 5 },
        ]));

        const ok = reconcileR2Bucket(rows, objects);
        expect(ok.mismatches).toEqual([]);
        expect(ok.notes).toContain("objects_outside_file_namespace:1");
        expect(reconciliationExitCode([ok])).toBe(0);

        const drifted = reconcileR2Bucket(rows, await listAllObjects(fakeLister([
            { key: "evt/e1/2026-09/f1/a.jpg", size: 11 },
            { key: "global/2026-09/orphan/c.jpg", size: 1 },
        ])));
        expect(drifted.mismatches[0]).toBe("size_mismatch:f1");
        expect(drifted.mismatches[1]).toBe("missing_object:f2");
        expect(drifted.mismatches[2]).toMatch(/^extra_object:[0-9a-f]{16}$/);
        // Keys can embed an original file name: never printed.
        expect(drifted.mismatches.join(" ")).not.toContain("orphan");
    });

    it("parses a ListObjectsV2 page and its continuation", () => {
        const page = parseListObjectsV2(
            "<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;2</NextContinuationToken>" +
            "<Contents><Key>evt/a&amp;b.jpg</Key><Size>42</Size><ETag>&quot;abc&quot;</ETag></Contents></ListBucketResult>",
        );
        expect(page).toEqual({ objects: [{ key: "evt/a&b.jpg", size: 42, etag: "abc" }], nextToken: "t&2" });
    });

    it("derives the legacy plan from the organization owner's subscription", () => {
        const state = legacyBillingState(
            {
                organization: [{ id: "o1" }, { id: "o2" }],
                member: [
                    { organizationId: "o1", userId: "u1", role: "owner" },
                    { organizationId: "o2", userId: "u2", role: "owner" },
                    { organizationId: "o2", userId: "u1", role: "member" },
                ],
                creem_subscription: [
                    { id: "r1", referenceId: "u1", productId: "prod_atelier", status: "active", creemSubscriptionId: "s1", creemCustomerId: "c1" },
                ],
                events: [],
            },
            [{ tier: "atelier", productId: "prod_atelier" }],
        );

        expect(state.subscriptions[0]!.organizationLegacyIds).toEqual(["o1"]);
        expect(state.organizations).toEqual([
            { legacyId: "o1", plan: "atelier", limits: { maxGuestsPerEvent: -1, maxActiveEvents: -1, maxReminders: -1 }, customerIds: ["c1"] },
            { legacyId: "o2", plan: "free", limits: { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3 }, customerIds: [] },
        ]);
    });

    it("compares the legacy `svix_id` as `svixId`", () => {
        const source = { id: "ee-1", messageId: "m", type: "t", recipient: "r@example.com", svix_id: "svix_1", createdAt: "2026-01-01T00:00:00.000Z" };
        const target = { _id: "k_ee", legacyId: "ee-1", messageId: "m", type: "t", recipient: "r@example.com", svixId: "svix_1", createdAt: Date.parse("2026-01-01T00:00:00.000Z") };

        expect(reconcileDomainTable("emailEvents", [source], [target], legacyIdOf).mismatches).toEqual([]);
        expect(reconcileDomainTable("emailEvents", [source], [{ ...target, svixId: undefined }], legacyIdOf).mismatches)
            .toEqual(["field_mismatch:ee-1:svixId"]);
    });
});
