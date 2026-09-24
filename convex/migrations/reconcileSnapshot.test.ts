import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, components, internal } from "../_generated/api";
import { DOMAIN_BATCH_VERSION, domainBatchDigest } from "../lib/domainBatchDigest";
import { sha256Hex } from "../lib/bridgeHmac";
import { initConvexTestWithAuthComponent } from "../test.setup";

/**
 * Target side of the Task 16 reconciliation: only migrated rows are in scope,
 * and credentials leave the deployment as digests, never as values.
 */

const MIGRATION_KEY = "test-migration-key";

beforeEach(() => {
    process.env.MIGRATION_API_KEY = MIGRATION_KEY;
});

afterEach(() => {
    delete process.env.MIGRATION_API_KEY;
});

type Test = Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>;

async function importOrganizations(t: Test, records: Record<string, unknown>[]) {
    const envelope = { version: DOMAIN_BATCH_VERSION, table: "organizations" as const, batchIndex: 0, records };
    await t.mutation(internal.migrations.domainImport.importBatch, {
        migrationKey: MIGRATION_KEY,
        ...envelope,
        sha256: await domainBatchDigest(envelope),
    });
}

describe("reconcileSnapshot.tablePage", () => {
    it("pages through migrated rows only", async () => {
        const t = await initConvexTestWithAuthComponent();
        // A tenant created on the new stack: never in the reconciliation scope.
        await t.withIdentity({ subject: "native", email: "native@example.com", name: "n" })
            .mutation(api.organizations.ensureProvisioned, {});
        await importOrganizations(t, [
            { id: "org-1", name: "A", slug: "a", createdAt: "2026-01-01T00:00:00.000Z" },
            { id: "org-2", name: "B", slug: "b", createdAt: "2026-01-01T00:00:00.000Z" },
            { id: "org-3", name: "C", slug: "c", createdAt: "2026-01-01T00:00:00.000Z" },
        ]);

        const seen: string[] = [];
        let cursor: string | null = null;
        for (let guard = 0; guard < 10; guard += 1) {
            const page: { page: Array<{ legacyId?: string }>; isDone: boolean; continueCursor: string } =
                await t.query(internal.migrations.reconcileSnapshot.tablePage, {
                    migrationKey: MIGRATION_KEY,
                    table: "organizations",
                    cursor,
                    numItems: 2,
                });
            seen.push(...page.page.map((doc) => String(doc.legacyId)));
            if (page.isDone) break;
            cursor = page.continueCursor;
        }

        expect(seen.sort()).toEqual(["org-1", "org-2", "org-3"]);
    });

    it("refuses the wrong key and a table outside the migration", async () => {
        const t = await initConvexTestWithAuthComponent();
        const args = { cursor: null, numItems: 10 };

        await expect(
            t.query(internal.migrations.reconcileSnapshot.tablePage, { migrationKey: "x", table: "organizations", ...args }),
        ).rejects.toMatchObject({ data: { code: "INVALID_MIGRATION_KEY" } });
        await expect(
            t.query(internal.migrations.reconcileSnapshot.tablePage, { migrationKey: MIGRATION_KEY, table: "jobExecutions", ...args }),
        ).rejects.toMatchObject({ data: { code: "UNKNOWN_IMPORT_TABLE" } });
    });
});

describe("reconcileSnapshot.authPage", () => {
    it("returns credential digests, never the credential", async () => {
        const t = await initConvexTestWithAuthComponent();
        const user = (await t.mutation(components.betterAuth.adapter.create, {
            input: {
                model: "user",
                data: { name: "U", email: "u@example.com", emailVerified: true, createdAt: 1, updatedAt: 1 },
            },
        })) as { _id?: string; id?: string };
        const userId = String(user._id ?? user.id);
        await t.mutation(components.betterAuth.adapter.create, {
            input: {
                model: "account",
                data: {
                    userId,
                    providerId: "credential",
                    accountId: userId,
                    password: "$scrypt$secret-hash",
                    createdAt: 1,
                    updatedAt: 1,
                },
            },
        });

        const accounts = await t.query(internal.migrations.reconcileSnapshot.authPage, {
            migrationKey: MIGRATION_KEY,
            model: "account",
            cursor: null,
            numItems: 10,
        });

        expect(JSON.stringify(accounts)).not.toContain("$scrypt$secret-hash");
        expect(accounts.page).toEqual([
            expect.objectContaining({
                userId,
                providerId: "credential",
                passwordSha256: await sha256Hex("$scrypt$secret-hash"),
            }),
        ]);

        const users = await t.query(internal.migrations.reconcileSnapshot.authPage, {
            migrationKey: MIGRATION_KEY,
            model: "user",
            cursor: null,
            numItems: 10,
        });
        expect(users.page).toEqual([expect.objectContaining({ id: userId, email: "u@example.com" })]);
    });
});
