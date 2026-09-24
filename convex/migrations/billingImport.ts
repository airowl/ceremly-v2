import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { canonicalJson } from "../lib/bridgeHmac";
import { domainBatchDigest } from "../lib/domainBatchDigest";
import { assertMigrationKey } from "../lib/migrationKey";

/**
 * Import of the legacy `creem_subscription` rows (plan Task 16, fix round 1).
 *
 * Where the data goes is decided by what the app reads: `billing.planForActiveOrganization`
 * and `billing.reconcileSnapshot` read the **Creem component** (customer by
 * entity, subscriptions by customer), so the import writes there, through the
 * component's own idempotent mutations (`insertCustomer`, `createSubscription`) —
 * the same doors the webhook uses.
 *
 * The one translation that matters: in the legacy B2C model `referenceId` is the
 * **user** who paid, and an organization's plan was that of its owner
 * (`planLimit.service.ts` → `resolveOrgOwnerId`). The Convex entity is the
 * organization, so a subscription is attached to every organization the paying
 * user owns — exactly the set the legacy granted the plan to. A `referenceId`
 * that is already an organization id (B2B rows) is used as is.
 *
 * Deliberately not fabricated: the legacy row has no amount, currency, interval
 * or creation date, so those are `null` (or the period start). The legacy order
 * id and row id travel in `metadata` so the reconciliation can compare them.
 *
 * Deferred, counted and named (never silently dropped): a row that never got a
 * Creem subscription id (`pendingSubscription`) or has no Creem customer
 * (`subscriptionWithoutCustomer`), and a paying user who owns no organization
 * (`ownerWithoutOrganization`).
 */

export const BILLING_IMPORT_TABLE = "creem_subscription";

export interface LegacySubscriptionRow {
    id: string;
    productId: string;
    referenceId: string;
    creemCustomerId?: string | null;
    creemSubscriptionId?: string | null;
    creemOrderId?: string | null;
    status?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
}

export interface BillingImportResult {
    batchIndex: number;
    records: number;
    /** Subscriptions written (created or changed), counted per organization. */
    imported: number;
    /** Subscriptions already present with the same values. */
    skipped: number;
    deferred: Record<string, number>;
    digest: string;
}

const iso = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

/** Organizations the legacy granted this subscription's plan to. */
async function organizationsFor(
    ctx: MutationCtx,
    referenceId: string,
): Promise<Id<"organizations">[] | "unresolved"> {
    const appUser = await ctx.db
        .query("appUsers")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", referenceId))
        .unique();

    if (appUser) {
        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", appUser._id))
            .collect();
        return memberships.filter((membership) => membership.role === "owner").map((membership) => membership.organizationId);
    }

    const organization = await ctx.db
        .query("organizations")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", referenceId))
        .unique();
    return organization ? [organization._id] : "unresolved";
}

/** The subscription document the component stores, from a legacy row. */
export function subscriptionFromLegacy(row: LegacySubscriptionRow) {
    const periodStart = iso(row.periodStart);
    return {
        id: String(row.creemSubscriptionId),
        customerId: String(row.creemCustomerId),
        productId: row.productId,
        status: row.status ?? "pending",
        amount: null,
        currency: null,
        recurringInterval: null,
        // Required strings in the component: the period start is the only date
        // the legacy has; an unknown one stays empty rather than invented.
        currentPeriodStart: periodStart ?? "",
        currentPeriodEnd: iso(row.periodEnd),
        cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
        startedAt: periodStart,
        endedAt: null,
        checkoutId: null,
        metadata: {
            migratedFrom: "neon",
            legacyRowId: row.id,
            legacyReferenceId: row.referenceId,
            ...(row.creemOrderId ? { legacyOrderId: row.creemOrderId } : {}),
        },
        createdAt: periodStart ?? "",
        modifiedAt: null,
    };
}

const COMPARED = ["customerId", "productId", "status", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "metadata"] as const;

export const importBatch = internalMutation({
    args: {
        migrationKey: v.string(),
        batchIndex: v.number(),
        version: v.optional(v.string()),
        watermark: v.optional(v.string()),
        records: v.array(v.any()),
        sha256: v.string(),
    },
    handler: async (ctx, args): Promise<BillingImportResult> => {
        assertMigrationKey(args.migrationKey);

        const digest = await domainBatchDigest({
            version: args.version,
            table: BILLING_IMPORT_TABLE as never,
            batchIndex: args.batchIndex,
            watermark: args.watermark,
            records: args.records,
        });
        if (digest !== args.sha256) {
            throw new ConvexError({ code: "BATCH_DIGEST_MISMATCH", table: BILLING_IMPORT_TABLE, batchIndex: args.batchIndex });
        }

        // Organizations must be imported first: the entity is resolved through them.
        const organizationsJournalled = await ctx.db
            .query("migrationRecords")
            .withIndex("by_table_batch", (q) => q.eq("table", "organizations"))
            .first();
        if (args.records.length > 0 && !organizationsJournalled) {
            throw new ConvexError({ code: "IMPORT_ORDER_VIOLATION", table: BILLING_IMPORT_TABLE, missingDependency: "organizations" });
        }

        const result: BillingImportResult = {
            batchIndex: args.batchIndex,
            records: args.records.length,
            imported: 0,
            skipped: 0,
            deferred: {},
            digest,
        };
        const defer = (reason: string) => {
            result.deferred[reason] = (result.deferred[reason] ?? 0) + 1;
        };

        for (const [index, raw] of (args.records as LegacySubscriptionRow[]).entries()) {
            if (!raw?.id || !raw.productId || !raw.referenceId) {
                throw new ConvexError({ code: "INVALID_BILLING_IMPORT_RECORD", index });
            }
            if (!raw.creemSubscriptionId) {
                defer("pendingSubscription");
                continue;
            }
            if (!raw.creemCustomerId) {
                defer("subscriptionWithoutCustomer");
                continue;
            }

            const organizations = await organizationsFor(ctx, raw.referenceId);
            if (organizations === "unresolved") {
                throw new ConvexError({
                    code: "UNRESOLVED_REFERENCE",
                    table: BILLING_IMPORT_TABLE,
                    index,
                    field: "referenceId",
                    referencedLegacyId: raw.referenceId,
                });
            }
            if (organizations.length === 0) {
                defer("ownerWithoutOrganization");
                continue;
            }

            const subscription = subscriptionFromLegacy(raw);
            for (const organizationId of organizations) {
                await ctx.runMutation(components.creem.lib.insertCustomer, {
                    id: subscription.customerId,
                    entityId: organizationId,
                });

                const existing = await ctx.runQuery(components.creem.lib.getSubscription, { id: subscription.id });
                const unchanged =
                    existing !== null &&
                    COMPARED.every(
                        (field) => canonicalJson(existing[field] ?? null) === canonicalJson(subscription[field] ?? null),
                    );
                if (unchanged) {
                    result.skipped += 1;
                    continue;
                }

                await ctx.runMutation(components.creem.lib.createSubscription, { subscription });
                result.imported += 1;
            }
        }

        await writeAudit(ctx, {
            action: "admin.migration_billing_imported",
            targetType: "migrationBatch",
            targetId: `${BILLING_IMPORT_TABLE}#${args.batchIndex}`,
            details: {
                batchIndex: args.batchIndex,
                records: result.records,
                imported: result.imported,
                skipped: result.skipped,
                deferred: result.deferred,
                sha256: digest,
            },
        });

        await ctx.db.insert("migrationRecords", {
            table: BILLING_IMPORT_TABLE,
            batchIndex: args.batchIndex,
            sha256: digest,
            ...(args.version !== undefined ? { version: args.version } : {}),
            ...(args.watermark !== undefined ? { watermark: args.watermark } : {}),
            records: result.records,
            imported: result.imported,
            skipped: result.skipped,
            importedAt: Date.now(),
        });

        return result;
    },
});
