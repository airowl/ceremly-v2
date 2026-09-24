import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { DOMAIN_BATCH_VERSION, domainBatchDigest } from "../lib/domainBatchDigest";
import { initConvexTest } from "../test.setup";

/**
 * Task 16 fix round 1: legacy `creem_subscription` → Creem component, where
 * `billing.planForActiveOrganization` reads the plan from.
 */

process.env.CREEM_PRODUCT_ID_ATELIER = "prod_test_atelier";
process.env.CREEM_PRODUCT_ID_CELEBRATION = "prod_test_celebration";

const MIGRATION_KEY = "test-migration-key";

beforeEach(() => {
    process.env.MIGRATION_API_KEY = MIGRATION_KEY;
});
afterEach(() => {
    delete process.env.MIGRATION_API_KEY;
});

type Test = ReturnType<typeof initConvexTest>;

/** A migrated tenant: owner profile + organization + membership, with legacy ids. */
async function seedMigratedTenant(t: Test, subject = "auth_owner") {
    return await t.run(async (ctx) => {
        const appUserId = await ctx.db.insert("appUsers", {
            authUserId: subject,
            email: `${subject}@example.com`,
            globalRole: "user",
            locale: "it",
            legacyId: "legacy-user-1",
        } as never);
        const organizationId = (await ctx.db.insert("organizations", {
            name: "Org",
            slug: "org",
            createdAt: 0,
            legacyId: "legacy-org-1",
        } as never)) as Id<"organizations">;
        await ctx.db.insert("memberships", { organizationId, userId: appUserId, role: "owner", createdAt: 0 } as never);
        await ctx.db.patch(appUserId as never, { activeOrganizationId: organizationId } as never);
        await ctx.db.insert("migrationRecords", {
            table: "organizations", batchIndex: 0, sha256: "x", records: 1, imported: 1, skipped: 0, importedAt: 0,
        });
        return { appUserId, organizationId };
    });
}

const legacyRow = (overrides: Record<string, unknown> = {}) => ({
    id: "legacy-sub-row-1",
    productId: "prod_test_atelier",
    referenceId: "legacy-user-1",
    creemCustomerId: "cust_1",
    creemSubscriptionId: "sub_1",
    creemOrderId: "ord_1",
    status: "active",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    ...overrides,
});

async function send(t: Test, records: Record<string, unknown>[], batchIndex = 0, sha256?: string) {
    const envelope = { version: DOMAIN_BATCH_VERSION, table: "creem_subscription" as never, batchIndex, records };
    return await t.mutation(internal.migrations.billingImport.importBatch, {
        migrationKey: MIGRATION_KEY,
        batchIndex,
        version: DOMAIN_BATCH_VERSION,
        records,
        sha256: sha256 ?? (await domainBatchDigest(envelope)),
    });
}

describe("billingImport.importBatch", () => {
    it("attaches the owner's subscription to the organization and the app sees Atelier", async () => {
        const t = initConvexTest();
        register(t);
        const { organizationId } = await seedMigratedTenant(t);

        const result = await send(t, [legacyRow()]);
        expect(result).toMatchObject({ records: 1, imported: 1, skipped: 0, deferred: {} });

        const plan = await t.withIdentity({ subject: "auth_owner", email: "auth_owner@example.com" })
            .query(api.billing.planForActiveOrganization, {});
        expect(plan.plan).toBe("atelier");
        expect(plan.customer?.id).toBe("cust_1");

        const snapshot = await t.query(internal.billing.reconcileSnapshot, {});
        expect(snapshot.subscriptions).toEqual([
            expect.objectContaining({ id: "sub_1", organizationId, legacyOrderId: "ord_1" }),
        ]);
    });

    it("is idempotent, and rewrites a subscription whose status changed", async () => {
        const t = initConvexTest();
        register(t);
        await seedMigratedTenant(t);

        await send(t, [legacyRow()]);
        const replay = await send(t, [legacyRow()], 1);
        expect(replay).toMatchObject({ imported: 0, skipped: 1 });

        const changed = await send(t, [legacyRow({ status: "canceled", cancelAtPeriodEnd: true })], 2);
        expect(changed).toMatchObject({ imported: 1, skipped: 0 });
        const stored = await t.run(async (ctx) => await ctx.runQuery(components.creem.lib.getSubscription, { id: "sub_1" }));
        expect(stored?.status).toBe("canceled");
    });

    it("defers rows without a subscription or customer id, and refuses an unknown reference", async () => {
        const t = initConvexTest();
        register(t);
        await seedMigratedTenant(t);

        const deferred = await send(t, [
            legacyRow({ id: "r1", creemSubscriptionId: null }),
            legacyRow({ id: "r2", creemSubscriptionId: "sub_2", creemCustomerId: null }),
        ]);
        expect(deferred).toMatchObject({ imported: 0, deferred: { pendingSubscription: 1, subscriptionWithoutCustomer: 1 } });

        await expect(send(t, [legacyRow({ referenceId: "nobody" })], 1)).rejects.toMatchObject({
            data: { code: "UNRESOLVED_REFERENCE" },
        });
    });

    it("verifies the digest and writes an audit row without the payload", async () => {
        const t = initConvexTest();
        register(t);
        await seedMigratedTenant(t);

        await expect(send(t, [legacyRow()], 0, "0".repeat(64))).rejects.toMatchObject({
            data: { code: "BATCH_DIGEST_MISMATCH" },
        });

        await send(t, [legacyRow()]);
        const audits = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
        expect(audits.map((row) => row.action)).toEqual(["admin.migration_billing_imported"]);
        expect(JSON.stringify(audits)).not.toContain("cust_1");
    });
});
