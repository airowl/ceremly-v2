import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { creem, isAtelierSubscription, requireCreemConfiguration } from "./billing";
import { retryDeadJob } from "./jobs";
import { errorCode, requireReason } from "./lib/adminGuards";
import { writeAudit } from "./lib/audit";
import { requireSuperAdmin } from "./lib/authorization";
import { resolveEventLimits } from "./lib/domain";
import { forbidden, normalizeEmail } from "./lib/identity";
import {
    LIMIT_MAXIMA,
    OVERRIDABLE_LIMITS,
    applyLimitOverride,
    findLimitOverride,
    type OverridableLimit,
} from "./lib/limitOverrides";
import { limitsForOrgPlan, type OrgPlan } from "./lib/pricing";
import { assertRateLimit } from "./lib/rateLimit";
import { DEFAULT_SITE_MODE, SITE_MODE_KEY, resolveSiteMode, writeSiteMode } from "./siteSettings";

/**
 * Admin console (plan Task 15).
 *
 * Rules every function here follows, in this order:
 *
 * 1. `requireSuperAdmin(ctx)` is the first statement of every public handler —
 *    before any argument is looked up. The page middleware is a convenience; this
 *    is the gate. `convex/admin.test.ts` enumerates the module's public exports
 *    and fails when one is added without an authorization case.
 * 2. Writes take a `reason` that must be non-empty after trimming; it lands in
 *    the audit row (`details.reason`) written in the same transaction as the
 *    change, with actor, target and timestamp. Writes are rate limited on the
 *    `admin` bucket (keyed by the superAdmin's appUserId).
 * 3. Reads never return secrets or free provider text: no invitation hash, no
 *    guest token, no export download token/URL/storage key, no job payload
 *    values, no Creem metadata, no stored error message (a code instead:
 *    `errorCode`); audit `details` pass through an allowlist projection
 *    (`projectAuditDetails`).
 * 4. Reads are indexed and bounded: lists are paginated with a clamped page
 *    size, searches are prefix ranges on an index, counters read at most the
 *    documented cap (`METRIC_CAPS`) and say `capped: true` when they hit it.
 *
 * Not here on purpose: impersonation, password changes, and any irreversible
 * delete. Billing has two non-destructive wrappers only (a provider consistency
 * check and a customer-portal link for the owner); cancel, refund and plan
 * changes stay in the Creem dashboard / customer portal.
 */

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

/** Largest page any list returns, whatever the client asks. */
export const MAX_PAGE_SIZE = 100;

/**
 * Upper bounds of the dashboard counters, per query transaction.
 *
 * A Convex query may read at most 16,384 documents (and a bounded number of
 * bytes); each dashboard query stays well under that. Past a cap the number is a
 * lower bound and the payload says so (`capped`). The event cap is smaller
 * because an event document carries its whole invitation (blocks, RSVP config).
 */
export const METRIC_CAPS = {
    users: 4000,
    organizations: 4000,
    jobsPerStatus: 500,
    exportsPerStatus: 500,
    superAdmins: 100,
    events: 500,
    rsvpResponses: 4000,
    billingOrganizations: 200,
    webhookEvents: 100,
    detailEvents: 1000,
    detailGuests: 2000,
} as const;

async function assertAdminRateLimit(ctx: MutationCtx, actor: Doc<"appUsers">): Promise<void> {
    await assertRateLimit(ctx, { bucket: "admin", key: actor._id });
}

function clampPage(options: PaginationOptions): PaginationOptions {
    return { ...options, numItems: Math.max(1, Math.min(options.numItems, MAX_PAGE_SIZE)) };
}

/** `[start, end)` of a prefix range on a string index. */
function prefixRange(prefix: string): { start: string; end: string } {
    return { start: prefix, end: `${prefix}￿` };
}

async function countUpTo(
    rows: Promise<unknown[]>,
    cap: number,
): Promise<{ total: number; capped: boolean }> {
    const found = (await rows).length;
    return { total: Math.min(found, cap), capped: found > cap };
}

const SECRET_KEY_PATTERN = /(token|secret|password|hash|signature|api_?key|authorization|cookie)/i;

/**
 * Audit `details` keys the console may show (fix round 1: an allowlist, not a
 * denylist). Audit rows are written by every task of the migration and imported
 * from the legacy app; a key not listed here is dropped and only counted.
 */
const AUDIT_DETAIL_KEYS = new Set([
    "reason",
    "source",
    "from",
    "to",
    "cleared",
    "name",
    "previousAttempts",
    "lastErrorCode",
    "email",
    "targetEmail",
    "role",
    "previousRole",
    "newRole",
    "status",
    "tier",
    "mode",
    "type",
    "outcome",
    "count",
    "total",
    "imported",
    "skipped",
    "deleted",
    "memberships",
    "invitations",
    "explicitTarget",
    "eventId",
    "guestId",
    "organizationId",
    "fileId",
    "jobId",
    "productId",
    "subscriptionId",
    "subscriptionIds",
    "customerId",
]);

/** Longest free string shown (the operator's own `reason` has its own cap). */
const MAX_DETAIL_STRING = 200;
/** URLs and long opaque runs (tokens, signatures, base64) never leave the server. */
const UNSAFE_STRING = /(https?:\/\/|[A-Za-z0-9+/_=-]{40,})/;

type DetailScalar = string | number | boolean | null;
type DetailValue = DetailScalar | DetailScalar[] | Record<string, DetailScalar | DetailScalar[]>;

function safeScalar(value: unknown, maxLength: number): DetailScalar | undefined {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
        if (value.length > maxLength || UNSAFE_STRING.test(value)) return undefined;
        return value;
    }
    return undefined;
}

function safeLeaf(value: unknown): DetailScalar | DetailScalar[] | undefined {
    if (Array.isArray(value)) {
        const items = value.slice(0, 20).map((item) => safeScalar(item, MAX_DETAIL_STRING));
        return items.every((item) => item !== undefined) ? (items as DetailScalar[]) : undefined;
    }
    return safeScalar(value, MAX_DETAIL_STRING);
}

/**
 * The audit `details` the console shows: allowlisted keys only, primitive values
 * (one level of nesting for `from`/`to`), no URL or token-like string, and never
 * a key that names a credential — whatever the writer put in the row.
 */
export function projectAuditDetails(details: unknown): { details: Record<string, DetailValue>; omitted: number } {
    const projected: Record<string, DetailValue> = {};
    let omitted = 0;
    if (details === null || typeof details !== "object" || Array.isArray(details)) {
        return { details: projected, omitted: details === null || details === undefined ? 0 : 1 };
    }

    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
        if (!AUDIT_DETAIL_KEYS.has(key) || SECRET_KEY_PATTERN.test(key)) {
            omitted += 1;
            continue;
        }
        if (key === "reason") {
            const reason = safeScalar(value, 500);
            if (typeof reason === "string") projected.reason = reason;
            else omitted += 1;
            continue;
        }
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            const nested: Record<string, DetailScalar | DetailScalar[]> = {};
            for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
                const leaf = SECRET_KEY_PATTERN.test(innerKey) ? undefined : safeLeaf(innerValue);
                if (leaf === undefined) omitted += 1;
                else nested[innerKey] = leaf;
            }
            projected[key] = nested;
            continue;
        }
        const leaf = safeLeaf(value);
        if (leaf === undefined) omitted += 1;
        else projected[key] = leaf;
    }
    return { details: projected, omitted };
}

// ---------------------------------------------------------------------------
// Safe projections (the only shapes that leave this module)
// ---------------------------------------------------------------------------

function userView(user: Doc<"appUsers">) {
    return {
        _id: user._id,
        email: user.email,
        globalRole: user.globalRole,
        locale: user.locale,
        activeOrganizationId: user.activeOrganizationId ?? null,
        deletionRequestedAt: user.deletionRequestedAt ?? null,
        purgeAt: user.purgeAt ?? null,
        legacyId: user.legacyId ?? null,
        createdAt: user._creationTime,
    };
}

function organizationView(organization: Doc<"organizations">) {
    return {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        legacyId: organization.legacyId ?? null,
        createdAt: organization.createdAt,
    };
}

function eventView(event: Doc<"events">, organizationName: string | null) {
    return {
        _id: event._id,
        organizationId: event.organizationId,
        organizationName,
        title: event.title,
        slug: event.slug,
        type: event.type,
        status: event.status,
        tier: event.tier,
        eventDate: event.eventDate ?? null,
        unlockedAt: event.unlockedAt ?? null,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
    };
}

function exportView(row: Doc<"dataExports">, email: string | null) {
    return {
        _id: row._id,
        userId: row.userId,
        userEmail: email,
        status: row.status,
        format: row.format,
        fileSize: row.fileSize ?? null,
        // A code, never the stored text (fix round 1).
        errorCode: errorCode(row.errorMessage),
        createdAt: row.createdAt,
        completedAt: row.completedAt ?? null,
        expiresAt: row.expiresAt ?? null,
    };
}

function jobView(job: Doc<"jobExecutions">) {
    const payload = job.payload;
    return {
        _id: job._id,
        name: job.name,
        status: job.status,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        // A code, never the stored text: provider errors may carry personal data.
        lastErrorCode: errorCode(job.lastError),
        providerId: job.providerId ?? null,
        // Keys only: payloads are ids by design, but the console has no reason to
        // echo values it does not need.
        payloadKeys:
            payload !== null && typeof payload === "object" ? Object.keys(payload as object).sort() : [],
        nextAttemptAt: job.nextAttemptAt ?? null,
        finishedAt: job.finishedAt ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

async function emailOf(ctx: QueryCtx, userId: Id<"appUsers"> | undefined): Promise<string | null> {
    if (!userId) return null;
    return (await ctx.db.get(userId))?.email ?? null;
}

async function auditView(ctx: QueryCtx, row: Doc<"auditLogs">) {
    const { details, omitted } = projectAuditDetails(row.details ?? null);
    return {
        _id: row._id,
        action: row.action,
        category: row.category,
        status: row.status,
        actorAppUserId: row.actorAppUserId ?? null,
        actorEmail: await emailOf(ctx, row.actorAppUserId),
        organizationId: row.organizationId ?? null,
        targetType: row.targetType ?? null,
        targetId: row.targetId ?? null,
        reason: typeof details.reason === "string" ? details.reason : null,
        details,
        omittedDetails: omitted,
        createdAt: row.createdAt,
    };
}

function subscriptionView(subscription: {
    id: string;
    productId: string;
    product?: { name: string } | null;
    status: string;
    amount: number | null;
    currency: string | null;
    recurringInterval: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    endedAt: string | null;
}) {
    return {
        id: subscription.id,
        productId: subscription.productId,
        productName: subscription.product?.name ?? null,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        recurringInterval: subscription.recurringInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
        endedAt: subscription.endedAt,
    };
}

// ---------------------------------------------------------------------------
// Identity and dashboard
// ---------------------------------------------------------------------------

/** "Am I a superAdmin?" — what the page middleware asks; a refusal is the answer. */
export const whoami = query({
    args: {},
    handler: async (ctx) => {
        const admin = await requireSuperAdmin(ctx);
        return { appUserId: admin._id, email: admin.email };
    },
});

/** Users, organizations, job queue, exports and site mode. Bounded by `METRIC_CAPS`. */
export const overview = query({
    args: {},
    handler: async (ctx) => {
        await requireSuperAdmin(ctx);

        const users = await countUpTo(ctx.db.query("appUsers").take(METRIC_CAPS.users + 1), METRIC_CAPS.users);
        const superAdmins = await countUpTo(
            ctx.db
                .query("appUsers")
                .withIndex("by_global_role", (q) => q.eq("globalRole", "superAdmin"))
                .take(METRIC_CAPS.superAdmins + 1),
            METRIC_CAPS.superAdmins,
        );
        const scheduledForDeletion = await countUpTo(
            ctx.db
                .query("appUsers")
                .withIndex("by_purge_at", (q) => q.gt("purgeAt", 0))
                .take(METRIC_CAPS.users + 1),
            METRIC_CAPS.users,
        );
        const organizations = await countUpTo(
            ctx.db.query("organizations").take(METRIC_CAPS.organizations + 1),
            METRIC_CAPS.organizations,
        );

        const jobStatuses = ["pending", "running", "retrying", "dead"] as const;
        const jobCounts = await Promise.all(
            jobStatuses.map(async (status) =>
                countUpTo(
                    ctx.db
                        .query("jobExecutions")
                        .withIndex("by_status_next_attempt", (q) => q.eq("status", status))
                        .take(METRIC_CAPS.jobsPerStatus + 1),
                    METRIC_CAPS.jobsPerStatus,
                ),
            ),
        );

        const exportStatuses = ["pending", "processing", "failed"] as const;
        const exportCounts = await Promise.all(
            exportStatuses.map(async (status) =>
                countUpTo(
                    ctx.db
                        .query("dataExports")
                        .withIndex("by_status", (q) => q.eq("status", status))
                        .take(METRIC_CAPS.exportsPerStatus + 1),
                    METRIC_CAPS.exportsPerStatus,
                ),
            ),
        );

        const siteRow = await ctx.db
            .query("siteSettings")
            .withIndex("by_key", (q) => q.eq("key", SITE_MODE_KEY))
            .unique();

        // Every counter is `{ total, capped }`: a capped one is a lower bound.
        return {
            users,
            superAdmins,
            scheduledForDeletion,
            organizations,
            jobs: {
                pending: jobCounts[0]!,
                running: jobCounts[1]!,
                retrying: jobCounts[2]!,
                dead: jobCounts[3]!,
            },
            exports: {
                pending: exportCounts[0]!,
                processing: exportCounts[1]!,
                failed: exportCounts[2]!,
            },
            siteMode: siteRow ? resolveSiteMode(siteRow.value) : DEFAULT_SITE_MODE,
            siteModeOverridden: siteRow !== null,
            caps: METRIC_CAPS,
        };
    },
});

/**
 * Events, RSVP and conversions (free → Celebrazione). Bounded by `METRIC_CAPS`.
 * When `events.capped`, the breakdown and the rate describe the most recent
 * `METRIC_CAPS.events` events only.
 */
export const eventMetrics = query({
    args: {},
    handler: async (ctx) => {
        await requireSuperAdmin(ctx);

        const events = await ctx.db.query("events").order("desc").take(METRIC_CAPS.events + 1);
        const eventsCapped = events.length > METRIC_CAPS.events;
        const sample = events.slice(0, METRIC_CAPS.events);

        const byStatus = { draft: 0, active: 0, closed: 0 };
        let celebration = 0;
        let unlocked = 0;
        for (const event of sample) {
            byStatus[event.status] += 1;
            if (event.tier === "celebration") celebration += 1;
            if (event.unlockedAt !== undefined) unlocked += 1;
        }

        const responses = await ctx.db.query("rsvpResponses").take(METRIC_CAPS.rsvpResponses + 1);
        const rsvpCapped = responses.length > METRIC_CAPS.rsvpResponses;
        const rsvp = { yes: 0, no: 0, maybe: 0 };
        for (const response of responses.slice(0, METRIC_CAPS.rsvpResponses)) {
            rsvp[response.attending] += 1;
        }

        return {
            events: { total: sample.length, capped: eventsCapped, byStatus },
            celebration: { total: celebration, capped: eventsCapped },
            unlocked: { total: unlocked, capped: eventsCapped },
            conversionRate: sample.length === 0 ? 0 : celebration / sample.length,
            conversionSampled: eventsCapped,
            rsvp: { total: Math.min(responses.length, METRIC_CAPS.rsvpResponses), capped: rsvpCapped, ...rsvp },
        };
    },
});

/** Atelier subscriptions and recent webhook outcomes. Bounded by `METRIC_CAPS`. */
export const billingMetrics = query({
    args: {},
    handler: async (ctx) => {
        await requireSuperAdmin(ctx);

        const organizations = await ctx.db
            .query("organizations")
            .order("desc")
            .take(METRIC_CAPS.billingOrganizations + 1);
        const capped = organizations.length > METRIC_CAPS.billingOrganizations;
        const scanned = organizations.slice(0, METRIC_CAPS.billingOrganizations);

        const statuses: Record<string, number> = {};
        let atelierActive = 0;
        for (const organization of scanned) {
            const subscription = await ctx.runQuery(components.creem.lib.getCurrentSubscription, {
                entityId: organization._id,
            });
            if (!subscription) continue;
            statuses[subscription.status] = (statuses[subscription.status] ?? 0) + 1;
            if (isAtelierSubscription(subscription)) atelierActive += 1;
        }

        const webhooks = await ctx.db.query("webhookEvents").order("desc").take(METRIC_CAPS.webhookEvents);
        const webhookOutcomes: Record<string, number> = {};
        for (const row of webhooks) {
            webhookOutcomes[row.outcome] = (webhookOutcomes[row.outcome] ?? 0) + 1;
        }

        return {
            organizationsScanned: { total: scanned.length, capped },
            atelierActive: { total: atelierActive, capped },
            subscriptionStatuses: statuses,
            recentWebhookOutcomes: webhookOutcomes,
            lastWebhookAt: webhooks[0]?.processedAt ?? null,
        };
    },
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Newest first, or an email-prefix search on `by_email`. */
export const searchUsers = query({
    args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const options = clampPage(args.paginationOpts);
        const search = args.search ? normalizeEmail(args.search) : "";

        const result = search
            ? await ctx.db
                .query("appUsers")
                .withIndex("by_email", (q) =>
                    q.gte("email", prefixRange(search).start).lt("email", prefixRange(search).end),
                )
                .paginate(options)
            : await ctx.db.query("appUsers").order("desc").paginate(options);

        return { ...result, page: result.page.map(userView) };
    },
});

export const getUser = query({
    args: { userId: v.id("appUsers") },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);

        const user = await ctx.db.get(args.userId);
        if (!user) throw forbidden("USER_NOT_FOUND", { userId: args.userId });

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .take(50);
        const organizations = await Promise.all(
            memberships.map(async (membership) => {
                const organization = await ctx.db.get(membership.organizationId);
                return {
                    organizationId: membership.organizationId,
                    name: organization?.name ?? null,
                    slug: organization?.slug ?? null,
                    role: membership.role,
                    createdAt: membership.createdAt,
                };
            }),
        );

        const exports = await ctx.db
            .query("dataExports")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .order("desc")
            .take(10);

        const audit = await ctx.db
            .query("auditLogs")
            .withIndex("by_actor", (q) => q.eq("actorAppUserId", user._id))
            .order("desc")
            .take(20);

        return {
            user: userView(user),
            memberships: organizations,
            exports: exports.map((row) => exportView(row, user.email)),
            recentAudit: await Promise.all(audit.map((row) => auditView(ctx, row))),
        };
    },
});

/**
 * Grants or revokes the global superAdmin role.
 *
 * After the bootstrap this is the only way a role changes: an existing
 * superAdmin, a reason, an audit row. A superAdmin cannot change their own role,
 * which also means the console can never demote its last administrator.
 */
export const setGlobalRole = mutation({
    args: {
        userId: v.id("appUsers"),
        role: v.union(v.literal("user"), v.literal("superAdmin")),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const admin = await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        await assertAdminRateLimit(ctx, admin);

        if (args.userId === admin._id) throw forbidden("CANNOT_CHANGE_OWN_ROLE");

        const target = await ctx.db.get(args.userId);
        if (!target) throw forbidden("USER_NOT_FOUND", { userId: args.userId });

        const previous = target.globalRole;
        if (previous === args.role) return { changed: false, role: previous, previous };

        await ctx.db.patch(target._id, { globalRole: args.role });
        await writeAudit(ctx, {
            action: "admin.role_changed",
            actorAppUserId: admin._id,
            actorAuthUserId: admin.authUserId,
            targetType: "user",
            targetId: target._id,
            details: { reason, from: previous, to: args.role, targetEmail: target.email },
        });

        return { changed: true, role: args.role, previous };
    },
});

// ---------------------------------------------------------------------------
// Organizations, limits and billing (read-only)
// ---------------------------------------------------------------------------

/** Newest first, or a slug-prefix search on `by_slug`. */
export const searchOrganizations = query({
    args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const options = clampPage(args.paginationOpts);
        const search = args.search?.trim().toLowerCase() ?? "";

        const result = search
            ? await ctx.db
                .query("organizations")
                .withIndex("by_slug", (q) =>
                    q.gte("slug", prefixRange(search).start).lt("slug", prefixRange(search).end),
                )
                .paginate(options)
            : await ctx.db.query("organizations").order("desc").paginate(options);

        return { ...result, page: result.page.map(organizationView) };
    },
});

function overrideView(override: Doc<"organizationLimitOverrides"> | null, updatedByEmail: string | null) {
    if (!override) return null;
    return {
        maxGuestsPerEvent: override.maxGuestsPerEvent ?? null,
        maxActiveEvents: override.maxActiveEvents ?? null,
        maxReminders: override.maxReminders ?? null,
        reason: override.reason,
        updatedAt: override.updatedAt,
        updatedByEmail,
    };
}

export const getOrganization = query({
    args: { organizationId: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);

        const organization = await ctx.db.get(args.organizationId);
        if (!organization) throw forbidden("ORGANIZATION_NOT_FOUND", { organizationId: args.organizationId });

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_org_user", (q) => q.eq("organizationId", organization._id))
            .take(100);
        const members = await Promise.all(
            memberships.map(async (membership) => ({
                userId: membership.userId,
                email: await emailOf(ctx, membership.userId),
                role: membership.role,
                createdAt: membership.createdAt,
            })),
        );

        const events = await countUpTo(
            ctx.db
                .query("events")
                .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
                .take(METRIC_CAPS.detailEvents + 1),
            METRIC_CAPS.detailEvents,
        );

        const [current, subscriptions, customer] = await Promise.all([
            ctx.runQuery(components.creem.lib.getCurrentSubscription, { entityId: organization._id }),
            ctx.runQuery(components.creem.lib.listAllUserSubscriptions, { entityId: organization._id }),
            ctx.runQuery(components.creem.lib.getCustomerByEntityId, { entityId: organization._id }),
        ]);
        const plan: OrgPlan = isAtelierSubscription(current) ? "atelier" : "free";

        const override = await findLimitOverride(ctx, organization._id);
        const audit = await ctx.db
            .query("auditLogs")
            .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
            .order("desc")
            .take(20);

        return {
            organization: organizationView(organization),
            members,
            events,
            plan,
            planLimits: limitsForOrgPlan(plan),
            effectiveLimits: applyLimitOverride(limitsForOrgPlan(plan), override),
            limitOverride: overrideView(override, await emailOf(ctx, override?.updatedByAppUserId)),
            subscriptions: subscriptions.map(subscriptionView),
            customerId: customer?.id ?? null,
            recentAudit: await Promise.all(audit.map((row) => auditView(ctx, row))),
        };
    },
});

const limitValue = v.union(v.number(), v.null());

/**
 * Sets the limit override of an organization (the legacy "custom limits").
 *
 * `null` clears a field (the plan value applies again); `-1` is unlimited. The
 * row is patched, never deleted: clearing every field is the way back, and the
 * audit keeps the full from/to history.
 */
export const setOrganizationLimits = mutation({
    args: {
        organizationId: v.id("organizations"),
        limits: v.object({
            maxGuestsPerEvent: limitValue,
            maxActiveEvents: limitValue,
            maxReminders: limitValue,
        }),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const admin = await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        await assertAdminRateLimit(ctx, admin);

        for (const key of OVERRIDABLE_LIMITS) {
            const value = args.limits[key];
            if (value === null) continue;
            if (!Number.isInteger(value) || value < -1 || value > LIMIT_MAXIMA[key]) {
                throw forbidden("INVALID_LIMIT", { field: key, max: LIMIT_MAXIMA[key] });
            }
        }

        const organization = await ctx.db.get(args.organizationId);
        if (!organization) throw forbidden("ORGANIZATION_NOT_FOUND", { organizationId: args.organizationId });

        const existing = await findLimitOverride(ctx, organization._id);
        const snapshot = (row: Partial<Record<OverridableLimit, number | null | undefined>> | null) =>
            Object.fromEntries(OVERRIDABLE_LIMITS.map((key) => [key, row?.[key] ?? null])) as Record<
                OverridableLimit,
                number | null
            >;
        const from = snapshot(existing);
        const to = snapshot(args.limits);

        const fields = {
            maxGuestsPerEvent: to.maxGuestsPerEvent ?? undefined,
            maxActiveEvents: to.maxActiveEvents ?? undefined,
            maxReminders: to.maxReminders ?? undefined,
            reason,
            updatedByAppUserId: admin._id,
            updatedAt: Date.now(),
        };
        if (existing) {
            await ctx.db.patch(existing._id, fields);
        } else {
            await ctx.db.insert("organizationLimitOverrides", { organizationId: organization._id, ...fields });
        }

        await writeAudit(ctx, {
            action: "admin.limits_updated",
            actorAppUserId: admin._id,
            actorAuthUserId: admin.authUserId,
            organizationId: organization._id,
            targetType: "organization",
            targetId: organization._id,
            details: { reason, from, to },
        });

        return { organizationId: organization._id, limits: to };
    },
});

// ---------------------------------------------------------------------------
// Billing wrappers (non-destructive): provider check and portal link
// ---------------------------------------------------------------------------

/** Most subscriptions compared per provider check (one Creem API call each). */
export const MAX_RECONCILE_SUBSCRIPTIONS = 10;

const BILLING_ADMIN_ACTIONS = v.union(
    v.literal("admin.billing_reconciled"),
    v.literal("admin.billing_portal_link_created"),
);

/**
 * Authorization for the billing actions. Actions have no `db`: this runs with the
 * caller's identity (Convex propagates it through `ctx.runQuery`), so the
 * superAdmin check and the reason check happen before any provider call.
 */
export const billingActionContext = internalQuery({
    args: { organizationId: v.id("organizations"), reason: v.string() },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        const organization = await ctx.db.get(args.organizationId);
        if (!organization) throw forbidden("ORGANIZATION_NOT_FOUND", { organizationId: args.organizationId });
        return { reason };
    },
});

/**
 * Rate limit + audit of a billing action, written **before** the provider call:
 * a portal link that exists was audited first. Re-checks the role (the identity
 * is propagated from the action).
 */
export const recordBillingAction = internalMutation({
    args: {
        organizationId: v.id("organizations"),
        action: BILLING_ADMIN_ACTIONS,
        reason: v.string(),
        subscriptionIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const admin = await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        await assertAdminRateLimit(ctx, admin);
        await writeAudit(ctx, {
            action: args.action,
            actorAppUserId: admin._id,
            actorAuthUserId: admin.authUserId,
            organizationId: args.organizationId,
            targetType: "organization",
            targetId: args.organizationId,
            details: {
                reason,
                ...(args.subscriptionIds ? { subscriptionIds: args.subscriptionIds } : {}),
            },
        });
    },
});

interface ReconcileItem {
    subscriptionId: string;
    localStatus: string;
    remoteStatus: string | null;
    /** Fields whose local mirror disagrees with Creem. */
    drift: ("status" | "productId" | "currentPeriodEnd")[];
    errorCode: string | null;
}

/**
 * Compares the organization's local subscription mirror with Creem (read-only on
 * both sides). The mirror is written by the webhook only — this action reports
 * drift, it does not repair it: the fix for a drift is a webhook redelivery from
 * the Creem dashboard, which goes through the same idempotent fulfillment path.
 */
export const reconcileOrganizationBilling = action({
    args: { organizationId: v.id("organizations"), reason: v.string() },
    handler: async (ctx, args): Promise<{ checked: number; truncated: boolean; items: ReconcileItem[] }> => {
        const { reason } = await ctx.runQuery(internal.admin.billingActionContext, args);
        requireCreemConfiguration();

        const local = await ctx.runQuery(components.creem.lib.listAllUserSubscriptions, {
            entityId: args.organizationId,
        });
        const subset = local.slice(0, MAX_RECONCILE_SUBSCRIPTIONS);

        await ctx.runMutation(internal.admin.recordBillingAction, {
            organizationId: args.organizationId,
            action: "admin.billing_reconciled",
            reason,
            subscriptionIds: subset.map((subscription) => subscription.id),
        });

        const items: ReconcileItem[] = [];
        for (const subscription of subset) {
            try {
                const remote = await creem.sdk.subscriptions.get(subscription.id);
                const remoteProduct = typeof remote.product === "string" ? remote.product : remote.product.id;
                const remoteEnd = remote.currentPeriodEndDate ? remote.currentPeriodEndDate.getTime() : null;
                const localEnd = subscription.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : null;

                const drift: ReconcileItem["drift"] = [];
                if (remote.status !== subscription.status) drift.push("status");
                if (remoteProduct !== subscription.productId) drift.push("productId");
                if (
                    remoteEnd !== localEnd
                    && (remoteEnd === null || localEnd === null || Math.abs(remoteEnd - localEnd) > 1000)
                ) {
                    drift.push("currentPeriodEnd");
                }

                items.push({
                    subscriptionId: subscription.id,
                    localStatus: subscription.status,
                    remoteStatus: String(remote.status),
                    drift,
                    errorCode: null,
                });
            } catch {
                // The provider's error text is not shown: a code is enough to act on.
                items.push({
                    subscriptionId: subscription.id,
                    localStatus: subscription.status,
                    remoteStatus: null,
                    drift: [],
                    errorCode: "PROVIDER_ERROR",
                });
            }
        }

        return { checked: subset.length, truncated: local.length > subset.length, items };
    },
});

/**
 * A Creem customer-portal link for the organization, to hand to its owner (who
 * manages or cancels the subscription there). The console itself changes
 * nothing at the provider.
 */
export const customerPortalLink = action({
    args: { organizationId: v.id("organizations"), reason: v.string() },
    handler: async (ctx, args): Promise<{ url: string }> => {
        const { reason } = await ctx.runQuery(internal.admin.billingActionContext, args);
        requireCreemConfiguration();

        const customer = await ctx.runQuery(components.creem.lib.getCustomerByEntityId, {
            entityId: args.organizationId,
        });
        if (!customer) throw forbidden("BILLING_CUSTOMER_NOT_FOUND");

        await ctx.runMutation(internal.admin.recordBillingAction, {
            organizationId: args.organizationId,
            action: "admin.billing_portal_link_created",
            reason,
        });

        return await creem.customers.portalUrl(ctx, { entityId: args.organizationId });
    },
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Newest first, a slug-prefix search, or the events of one organization. */
export const searchEvents = query({
    args: {
        search: v.optional(v.string()),
        organizationId: v.optional(v.id("organizations")),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const options = clampPage(args.paginationOpts);
        const search = args.search?.trim().toLowerCase() ?? "";
        const organizationId = args.organizationId;

        const result = organizationId
            ? await ctx.db
                .query("events")
                .withIndex("by_organization_created", (q) => q.eq("organizationId", organizationId))
                .order("desc")
                .paginate(options)
            : search
                ? await ctx.db
                    .query("events")
                    .withIndex("by_slug", (q) =>
                        q.gte("slug", prefixRange(search).start).lt("slug", prefixRange(search).end),
                    )
                    .paginate(options)
                : await ctx.db.query("events").order("desc").paginate(options);

        const names = new Map<string, string | null>();
        const page = [];
        for (const event of result.page) {
            if (!names.has(event.organizationId)) {
                names.set(event.organizationId, (await ctx.db.get(event.organizationId))?.name ?? null);
            }
            page.push(eventView(event, names.get(event.organizationId) ?? null));
        }
        return { ...result, page };
    },
});

export const getEvent = query({
    args: { eventId: v.id("events") },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);

        const event = await ctx.db.get(args.eventId);
        if (!event) throw forbidden("EVENT_NOT_FOUND", { eventId: args.eventId });
        const organization = await ctx.db.get(event.organizationId);

        const guests = await ctx.db
            .query("guests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .take(METRIC_CAPS.detailGuests + 1);
        const activeGuests = guests.slice(0, METRIC_CAPS.detailGuests).filter((guest) => guest.removedAt === undefined);

        const responses = await ctx.db
            .query("rsvpResponses")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .take(METRIC_CAPS.detailGuests + 1);
        const rsvp = { yes: 0, no: 0, maybe: 0 };
        for (const response of responses.slice(0, METRIC_CAPS.detailGuests)) rsvp[response.attending] += 1;

        return {
            event: eventView(event, organization?.name ?? null),
            guests: { active: activeGuests.length, capped: guests.length > METRIC_CAPS.detailGuests },
            rsvp: { ...rsvp, capped: responses.length > METRIC_CAPS.detailGuests },
            limits: await resolveEventLimits(ctx, event),
            billing: {
                hasCheckout: event.creemCheckoutId !== undefined,
                hasOrder: event.creemOrderId !== undefined,
            },
        };
    },
});

// ---------------------------------------------------------------------------
// Jobs, exports, audit
// ---------------------------------------------------------------------------

const jobStatus = v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("retrying"),
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("dead"),
);

export const listJobs = query({
    args: { status: jobStatus, paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const result = await ctx.db
            .query("jobExecutions")
            .withIndex("by_status_next_attempt", (q) => q.eq("status", args.status))
            .order("desc")
            .paginate(clampPage(args.paginationOpts));
        return { ...result, page: result.page.map(jobView) };
    },
});

/** `dead → pending`, the same transition as `jobs.retryDead`, with a reason. */
export const retryJob = mutation({
    args: { jobId: v.id("jobExecutions"), reason: v.string() },
    handler: async (ctx, args) => {
        const admin = await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        await assertAdminRateLimit(ctx, admin);
        return await retryDeadJob(ctx, admin, args.jobId, reason);
    },
});

const exportStatus = v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("expired"),
);

/** GDPR exports by status (metadata only: never the download token, URL or object key). */
export const listExports = query({
    args: { status: exportStatus, paginationOpts: paginationOptsValidator },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const result = await ctx.db
            .query("dataExports")
            .withIndex("by_status", (q) => q.eq("status", args.status))
            .order("desc")
            .paginate(clampPage(args.paginationOpts));
        const page = await Promise.all(
            result.page.map(async (row) => exportView(row, await emailOf(ctx, row.userId))),
        );
        return { ...result, page };
    },
});

/**
 * Audit trail, newest first. One filter at a time, each on its own index:
 * actor, then organization, then action; none means the whole log by time.
 */
export const listAudit = query({
    args: {
        actorAppUserId: v.optional(v.id("appUsers")),
        organizationId: v.optional(v.id("organizations")),
        action: v.optional(v.string()),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const options = clampPage(args.paginationOpts);
        const { actorAppUserId, organizationId } = args;
        const action = args.action?.trim();

        const result = actorAppUserId
            ? await ctx.db
                .query("auditLogs")
                .withIndex("by_actor", (q) => q.eq("actorAppUserId", actorAppUserId))
                .order("desc")
                .paginate(options)
            : organizationId
                ? await ctx.db
                    .query("auditLogs")
                    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
                    .order("desc")
                    .paginate(options)
                : action
                    ? await ctx.db
                        .query("auditLogs")
                        .withIndex("by_action", (q) => q.eq("action", action))
                        .order("desc")
                        .paginate(options)
                    : await ctx.db
                        .query("auditLogs")
                        .withIndex("by_created_at")
                        .order("desc")
                        .paginate(options);

        return { ...result, page: await Promise.all(result.page.map((row) => auditView(ctx, row))) };
    },
});

// ---------------------------------------------------------------------------
// Site mode
// ---------------------------------------------------------------------------

/** Sets the site mode (`null` clears the override) — `siteSettings` with a reason. */
export const setSiteMode = mutation({
    args: {
        mode: v.union(
            v.literal("active"),
            v.literal("waitinglist"),
            v.literal("maintenance"),
            v.literal("maintenance-readonly"),
            v.null(),
        ),
        reason: v.string(),
    },
    handler: async (ctx, args) => {
        const admin = await requireSuperAdmin(ctx);
        const reason = requireReason(args.reason);
        await assertAdminRateLimit(ctx, admin);
        return await writeSiteMode(ctx, admin, args.mode, reason);
    },
});

// ---------------------------------------------------------------------------
// Bootstrap of the first superAdmin
// ---------------------------------------------------------------------------

export const SUPER_ADMIN_ALLOWLIST_ENV = "SUPER_ADMIN_EMAIL_ALLOWLIST";

/** Comma-separated, normalized like every stored email. Empty entries are ignored. */
export function parseAllowlist(raw: string | undefined): string[] {
    return (raw ?? "")
        .split(",")
        .map((entry) => normalizeEmail(entry))
        .filter((entry) => entry.length > 0);
}

/**
 * Promotes the first superAdmin. Internal: only a deployment operator can run it
 * (`npx convex run admin:bootstrapSuperAdmin '{"email":"..."}'`).
 *
 * Three independent conditions: the email is on the deployment's
 * `SUPER_ADMIN_EMAIL_ALLOWLIST`, the account is already provisioned (the person
 * signed up), and no superAdmin exists yet. The last one is what makes this a
 * bootstrap and not a second door: once there is an administrator, roles change
 * only through `setGlobalRole` — an existing superAdmin, a reason, an audit row.
 */
export const bootstrapSuperAdmin = internalMutation({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const allowlist = parseAllowlist(process.env[SUPER_ADMIN_ALLOWLIST_ENV]);
        if (allowlist.length === 0) throw forbidden("SUPER_ADMIN_ALLOWLIST_EMPTY");

        const email = normalizeEmail(args.email);
        if (!allowlist.includes(email)) throw forbidden("EMAIL_NOT_ALLOWLISTED");

        const existingAdmin = await ctx.db
            .query("appUsers")
            .withIndex("by_global_role", (q) => q.eq("globalRole", "superAdmin"))
            .first();
        if (existingAdmin) throw forbidden("SUPER_ADMIN_ALREADY_EXISTS");

        const user = await ctx.db
            .query("appUsers")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique();
        if (!user) throw forbidden("APP_USER_NOT_FOUND");

        await ctx.db.patch(user._id, { globalRole: "superAdmin" });
        await writeAudit(ctx, {
            action: "admin.super_admin_bootstrapped",
            targetType: "user",
            targetId: user._id,
            details: { email, source: SUPER_ADMIN_ALLOWLIST_ENV, from: user.globalRole, to: "superAdmin" },
        });

        return { promoted: true, appUserId: user._id };
    },
});
