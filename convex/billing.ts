import { ConvexError, v, type Value } from "convex/values";
import {
    Creem,
    getConvexEntityId,
    getCustomerId,
    getEventData,
    getEventType,
    type CreemWebhookEvent,
} from "@creem_io/convex";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { forbidden } from "./lib/identity";
import { requireActiveOrganization, requireRole, type OrganizationRole } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { limitsForOrgPlan, productIdForTier, type OrgPlan, type PaidTier } from "./lib/pricing";


/**
 * Organization-scoped Creem billing (plan Task 6, spike G07).
 *
 * The single rule this file exists to enforce: **the billing entity is always
 * the caller's active organization, resolved server-side**. No function accepts
 * an `entityId` from the client, and the metadata Creem echoes back is written
 * by us (`convexBillingEntityId`), never by the caller — the component spreads
 * the caller's metadata first and its own reserved keys last, which is what makes
 * that guarantee structural rather than a convention.
 *
 * Charges:
 * - `atelier` is a recurring subscription owned by the organization;
 * - `celebration` is a one-time purchase owned by a single event, and paying it
 *   unlocks that event (`tier: free → celebration`).
 *
 * Fulfillment is exactly-once through the `webhookEvents` ledger: the Creem
 * component keeps no event log, so redelivery is handled here (see
 * `processWebhookEvent`).
 */

/**
 * The SDK is pointed at the server the validated configuration names, so the
 * deployment's `CREEM_SERVER` is what decides — never the SDK's default.
 * An invalid value falls back to `{}` here and is refused by
 * `requireCreemConfiguration()` at call time, which keeps the failure inside the
 * billing call instead of breaking every function in the deployment.
 */
export const creem = new Creem(components.creem, (() => {
    const resolved = resolveCreemServer(process.env.CREEM_API_KEY, process.env.CREEM_SERVER);
    return "server" in resolved ? { server: resolved.server } : {};
})());

const ATELIER_ACTIVE_STATUSES = ["active", "trialing"] as const;

/**
 * `true` when the subscription means "this organization is on Atelier".
 *
 * Legacy parity: Atelier is the only recurring product, so any active
 * subscription counted. When the deployment configures the Atelier product id we
 * additionally require the match, so a second recurring product could never be
 * mistaken for Atelier.
 */
export function isAtelierSubscription(
    subscription: { status?: string; productId?: string } | null | undefined,
): boolean {
    if (!subscription?.status) return false;
    if (!(ATELIER_ACTIVE_STATUSES as readonly string[]).includes(subscription.status)) return false;

    const configured = productIdForTier("atelier");
    return configured ? subscription.productId === configured : true;
}

interface BillingIdentity {
    authUserId: string;
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
    role: OrganizationRole;
    email: string;
}

/**
 * Authorization snapshot for the billing actions.
 *
 * Actions have no `db`, so the tenant resolution runs as an internal query —
 * and it runs with the caller's identity, which Convex propagates through
 * `ctx.runQuery` (verified in the G07 gate). This is the only place the org id
 * for a checkout comes from.
 */
export const billingAuthz = internalQuery({
    args: {
        roles: v.array(v.union(v.literal("owner"), v.literal("admin"), v.literal("member"))),
    },
    handler: async (ctx, args): Promise<BillingIdentity> => {
        const authz = args.roles.length > 0
            ? await requireRole(ctx, args.roles as readonly OrganizationRole[])
            : await requireActiveOrganization(ctx);

        const appUser = await ctx.db.get(authz.appUserId);
        const email = appUser?.email ?? "";
        if (email.length === 0) {
            throw forbidden("BILLING_EMAIL_UNAVAILABLE", { authUserId: authz.authUserId });
        }

        return { ...authz, email };
    },
});

/**
 * Creates the checkout on the Creem API and mirrors the component's customer
 * bookkeeping.
 *
 * Why not the component's own `checkouts.create`: it returns only the URL, and
 * the Creem checkout id is what lets a refund that arrives *before*
 * `checkout.completed` be matched back to its event (the legacy `Fix 7.2`).
 * The call below is the documented SDK usage plus the two component mutations the
 * component itself performs, so nothing is reimplemented beyond orchestration.
 */
/**
 * Checkout metadata, with the reserved keys written last.
 *
 * The component's own checkout path does the same; keeping the merge here makes
 * the guarantee testable and keeps it true on this path too: whatever the caller
 * sends, `convexBillingEntityId` is the organization resolved server-side.
 */
export function buildCheckoutMetadata(args: {
    userId: string;
    entityId: string;
    metadata?: Record<string, string>;
}): Record<string, string> {
    return {
        ...(args.metadata ?? {}),
        convexUserId: args.userId,
        convexBillingEntityId: args.entityId,
    };
}

async function createCreemCheckout(
    ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
    args: {
        productId: string;
        entityId: Id<"organizations">;
        userId: string;
        email: string;
        successUrl?: string;
        metadata?: Record<string, string>;
    },
): Promise<{ checkoutId: string; url: string }> {
    // Checked here, after authorization: an unauthenticated or non-owner caller
    // must learn nothing about the deployment's provider configuration.
    requireCreemConfiguration();

    const customer = await ctx.runQuery(components.creem.lib.getCustomerByEntityId, {
        entityId: args.entityId,
    });

    const checkout = await creem.sdk.checkouts.create({
        productId: args.productId,
        ...(args.successUrl ? { successUrl: args.successUrl } : {}),
        metadata: buildCheckoutMetadata({
            userId: args.userId,
            entityId: args.entityId,
            metadata: args.metadata,
        }),
        customer: customer ? { id: customer.id } : { email: args.email },
    });

    // Defensive parity with the component's own checkout path, which carries the
    // same branch. Measured on staging: `checkouts.create` returns **no**
    // `customer` field — Creem creates the customer at payment completion, and the
    // completion webhook is what mirrors it locally. So this only fires if the
    // response ever starts expanding `customer`; it is not the main path.
    if (!customer) {
        const customerId = getCustomerId(checkout.customer);
        if (customerId) {
            const customerEntity = typeof checkout.customer === "object" ? checkout.customer : undefined;
            await ctx.runMutation(components.creem.lib.insertCustomer, {
                id: customerId,
                entityId: args.entityId,
                email: customerEntity?.email,
                name: customerEntity?.name ?? undefined,
                country: customerEntity?.country ?? undefined,
                mode: customerEntity?.mode,
            });
        }
    }

    const url = checkout.checkoutUrl;
    if (!url) {
        throw new ConvexError({ code: "CREEM_CHECKOUT_URL_MISSING" });
    }

    return { checkoutId: checkout.id, url };
}

/**
 * Which Creem API a key talks to.
 *
 * Measured, not assumed: the Creem SDK **defaults to the production API** when no
 * server is configured — a test-mode key then gets a 401 from `api.creem.io`, and
 * a production key on a staging deployment would take real money. So the server
 * is derived from the key's own prefix, and an explicit `CREEM_SERVER` that
 * disagrees with it is refused instead of being trusted.
 */
export function resolveCreemServer(
    apiKey: string | undefined,
    configured: string | undefined,
): { server: "test" | "prod" } | { error: string; detail: Record<string, unknown> } {
    if (configured !== undefined && configured !== "test" && configured !== "prod") {
        return { error: "CREEM_SERVER_INVALID", detail: { configured } };
    }

    const fromKey = apiKey ? (apiKey.startsWith("creem_test_") ? "test" : "prod") : null;

    if (fromKey && configured && configured !== fromKey) {
        return { error: "CREEM_SERVER_KEY_MISMATCH", detail: { configured, keyPrefix: fromKey } };
    }

    // Not defaulted to production: an unset `CREEM_SERVER` is exactly the state
    // in which the SDK would silently pick the live API.
    if (fromKey && !configured) {
        return { error: "CREEM_SERVER_NOT_CONFIGURED", detail: { keyPrefix: fromKey } };
    }

    return { server: fromKey ?? "prod" };
}

/**
 * Environment access is deployment-level: a missing or incoherent configuration
 * is a misconfiguration, not a default. Checked at call time (not at module load)
 * so a bad value fails the billing call with a named code instead of taking the
 * whole deployment's function loading down with it.
 */
function requireCreemConfiguration(): void {
    if (!process.env.CREEM_API_KEY) {
        throw forbidden("CREEM_API_KEY_NOT_CONFIGURED");
    }

    const resolved = resolveCreemServer(process.env.CREEM_API_KEY, process.env.CREEM_SERVER);
    if ("error" in resolved) {
        throw forbidden(resolved.error, { ...resolved.detail } as Record<string, Value>);
    }
}

/**
 * `api.billing.checkoutsCreate` — starts a payment for the active organization.
 *
 * Owner only (legacy: only the billing owner could start a checkout). The event
 * is validated here *and* again at fulfillment: a foreign event id is refused
 * before Creem is even called.
 */
export const checkoutsCreate = action({
    args: {
        tier: v.union(v.literal("celebration"), v.literal("atelier")),
        eventId: v.optional(v.id("events")),
        successUrl: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ url: string; checkoutId: string }> => {
        // Explicit return type on purpose: `internal.billing.*` is referenced from
        // inside, so without it TypeScript cannot break the inference cycle.
        const identity: BillingIdentity = await ctx.runQuery(internal.billing.billingAuthz, {
            roles: ["owner"],
        });
        const productId = productIdForTier(args.tier);
        if (!productId) {
            throw forbidden("BILLING_PRODUCT_NOT_CONFIGURED", { tier: args.tier });
        }

        const metadata: Record<string, string> = {};
        if (args.tier === "celebration") {
            if (!args.eventId) {
                throw forbidden("EVENT_REQUIRED");
            }
            await ctx.runQuery(internal.billing.assertCelebrationPurchasable, {
                organizationId: identity.organizationId,
                eventId: args.eventId,
            });
            metadata.eventId = args.eventId;
        } else if (args.eventId) {
            throw forbidden("EVENT_NOT_ALLOWED_FOR_PLAN", { tier: args.tier });
        }

        const checkout = await createCreemCheckout(ctx, {
            productId,
            entityId: identity.organizationId,
            userId: identity.authUserId,
            email: identity.email,
            successUrl: args.successUrl,
            metadata,
        });

        await ctx.runMutation(internal.billing.recordCheckoutCreation, {
            organizationId: identity.organizationId,
            appUserId: identity.appUserId,
            authUserId: identity.authUserId,
            tier: args.tier,
            productId,
            checkoutId: checkout.checkoutId,
            eventId: args.eventId,
        });

        return { url: checkout.url, checkoutId: checkout.checkoutId };
    },
});

/**
 * `api.billing.customersPortalUrl` — the Creem customer portal for the active
 * organization. Owner only: it exposes invoices and payment methods.
 */
export const customersPortalUrl = action({
    args: {},
    handler: async (ctx): Promise<{ url: string }> => {
        const identity: BillingIdentity = await ctx.runQuery(internal.billing.billingAuthz, {
            roles: ["owner"],
        });
        requireCreemConfiguration();

        const customer = await ctx.runQuery(components.creem.lib.getCustomerByEntityId, {
            entityId: identity.organizationId,
        });
        if (!customer) {
            throw forbidden("BILLING_CUSTOMER_NOT_FOUND");
        }

        return await creem.customers.portalUrl(ctx, { entityId: identity.organizationId });
    },
});

/**
 * `api.billing.planForActiveOrganization` — the plan the active organization is
 * on, with the limits the domain enforces.
 *
 * Readable by any member (the dashboard shows the plan); mutations are what
 * require the owner.
 */
export const planForActiveOrganization = query({
    args: {},
    handler: async (ctx) => {
        const authz = await requireActiveOrganization(ctx);

        const [subscription, customer] = await Promise.all([
            ctx.runQuery(components.creem.lib.getCurrentSubscription, {
                entityId: authz.organizationId,
            }),
            ctx.runQuery(components.creem.lib.getCustomerByEntityId, {
                entityId: authz.organizationId,
            }),
        ]);

        const plan: OrgPlan = isAtelierSubscription(subscription) ? "atelier" : "free";

        return {
            organizationId: authz.organizationId,
            plan,
            limits: limitsForOrgPlan(plan),
            canManageBilling: authz.role === "owner",
            subscription: subscription
                ? {
                    id: subscription.id,
                    productId: subscription.productId,
                    status: subscription.status,
                    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                    recurringInterval: subscription.recurringInterval ?? null,
                }
                : null,
            customer: customer ? { id: customer.id, email: customer.email ?? null } : null,
        };
    },
});

/**
 * `internal.billing.assertCelebrationPurchasable` — the event-level guards.
 *
 * Runs before Creem is called, so an invalid purchase never creates a charge.
 * `event.organizationId === organizationId` is the tenant check: an event id
 * belonging to somebody else is reported as "not found", never as "forbidden".
 */
export const assertCelebrationPurchasable = internalQuery({
    args: {
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
    },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.eventId);
        if (!event || event.organizationId !== args.organizationId) {
            throw forbidden("EVENT_NOT_FOUND", { eventId: args.eventId });
        }
        if (event.tier !== "free") {
            throw forbidden("EVENT_ALREADY_UNLOCKED", { eventId: args.eventId });
        }

        const subscription = await ctx.runQuery(components.creem.lib.getCurrentSubscription, {
            entityId: args.organizationId,
        });
        if (isAtelierSubscription(subscription)) {
            throw forbidden("ORG_HAS_ATELIER", { organizationId: args.organizationId });
        }

        return { eventId: event._id, tier: event.tier };
    },
});

/**
 * Persists the checkout id on the event and audits the intent.
 *
 * The checkout id is written *before* the customer can pay: it is the only link
 * that survives when a refund arrives before `checkout.completed`.
 */
export const recordCheckoutCreation = internalMutation({
    args: {
        organizationId: v.id("organizations"),
        appUserId: v.id("appUsers"),
        authUserId: v.string(),
        tier: v.union(v.literal("celebration"), v.literal("atelier")),
        productId: v.string(),
        checkoutId: v.string(),
        eventId: v.optional(v.id("events")),
    },
    handler: async (ctx, args) => {
        if (args.eventId) {
            const event = await ctx.db.get(args.eventId);
            // Losing the link here would make a refunded checkout unrecoverable,
            // so a mismatch fails the call instead of being swallowed.
            if (!event || event.organizationId !== args.organizationId) {
                throw forbidden("EVENT_NOT_FOUND", { eventId: args.eventId });
            }
            await ctx.db.patch(event._id, { creemCheckoutId: args.checkoutId });
        }

        await writeAudit(ctx, {
            action: "billing.checkout_created",
            actorAppUserId: args.appUserId,
            actorAuthUserId: args.authUserId,
            organizationId: args.organizationId,
            targetType: args.eventId ? "event" : "organization",
            targetId: args.eventId ?? args.organizationId,
            details: { tier: args.tier, productId: args.productId, checkoutId: args.checkoutId },
        });

        return { checkoutId: args.checkoutId, eventId: args.eventId ?? null };
    },
});

// ---------------------------------------------------------------------------
// Webhook fulfillment
// ---------------------------------------------------------------------------

export interface NormalizedCreemEvent {
    providerEventId: string;
    type: string;
    /** Organization the payment belongs to, from the metadata we wrote. */
    entityId: string | null;
    eventId: string | null;
    creemOrderId: string | null;
    creemCheckoutId: string | null;
}

const stringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

/**
 * The parsed shapes as they arrive at the HTTP handler.
 *
 * Structural on purpose: the component hands us a *parsed* event (the SDK's
 * `WebhookEventEntity`), and these are the three fields the fulfillment needs.
 */
interface CheckoutLike {
    id?: string;
    order?: { id?: string } | string | null;
    metadata?: Record<string, unknown> | null;
}

interface RefundLike {
    order?: { id?: string } | string | null;
    checkout?: (CheckoutLike & { id?: string }) | string | null;
}

/**
 * Turns a delivered webhook into the flat command the fulfillment mutation takes.
 *
 * The event arrives **already parsed**: `registerRoutes` verifies the signature and
 * runs the SDK's `*FromJSON` on the body, which renames Creem's snake_case fields
 * to camelCase and turns `order.created_at` into a `Date`. Re-running the same
 * parser on that object fails its `created_at` requirement and returns `null`,
 * which is why the fields are read off the entity directly — feeding the parsed
 * object back through `parseCheckout` produced `ignored` fulfillments on staging
 * (measured, and pinned by a test that goes through the real parsing pipeline).
 *
 * `providerEventId` falls back to a digest of the payload when Creem sends no
 * event id: without a stable key the ledger could not dedupe, and a digest makes
 * an identical redelivery a duplicate while still treating a different payload as
 * a new event.
 */
export async function normalizeCreemEvent(event: CreemWebhookEvent): Promise<NormalizedCreemEvent> {
    const type = getEventType(event);
    const data = getEventData(event);
    const providerEventId = await resolveEventId(event, type, data);

    if (type === "checkout.completed") {
        const checkout = (data ?? {}) as CheckoutLike;
        const order = checkout.order;

        return {
            providerEventId,
            type,
            entityId: getConvexEntityId(checkout.metadata),
            eventId: stringOrNull(checkout.metadata?.eventId),
            creemOrderId: typeof order === "string" ? order : order?.id ?? null,
            creemCheckoutId: stringOrNull(checkout.id),
        };
    }

    if (type === "refund.created" || type === "dispute.created") {
        const refund = (data ?? {}) as RefundLike;
        const order = refund.order;
        const checkout = refund.checkout;

        return {
            providerEventId,
            type,
            entityId: getConvexEntityId(
                typeof checkout === "object" ? checkout?.metadata : undefined,
            ),
            eventId: null,
            creemOrderId: typeof order === "string" ? order : order?.id ?? null,
            creemCheckoutId:
                typeof checkout === "string" ? stringOrNull(checkout) : stringOrNull(checkout?.id),
        };
    }

    return {
        providerEventId,
        type,
        entityId: null,
        eventId: null,
        creemOrderId: null,
        creemCheckoutId: null,
    };
}

async function resolveEventId(
    event: CreemWebhookEvent,
    type: string,
    data: unknown,
): Promise<string> {
    const id = stringOrNull((event as { id?: unknown }).id);
    if (id) return id;

    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${type}:${JSON.stringify(data ?? null)}`),
    );

    return `derived:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export type WebhookOutcome =
    | "unlocked"
    | "already_unlocked"
    | "relocked"
    | "relock_noop"
    | "ignored"
    | "rejected_cross_tenant";

export interface WebhookResult {
    outcome: WebhookOutcome;
    /** `true` when the ledger already had this event: nothing ran twice. */
    duplicate: boolean;
}

/**
 * `internal.billing.processWebhookEvent` — the exactly-once fulfillment.
 *
 * One transaction: ledger check → side effect → ledger write. A replay finds the
 * ledger row and returns the recorded outcome without touching state or writing a
 * second audit record; a failed fulfillment throws, so the ledger row is never
 * written and Creem's retry gets a real attempt.
 */
export const processWebhookEvent = internalMutation({
    args: {
        providerEventId: v.string(),
        type: v.string(),
        entityId: v.optional(v.union(v.string(), v.null())),
        eventId: v.optional(v.union(v.string(), v.null())),
        creemOrderId: v.optional(v.union(v.string(), v.null())),
        creemCheckoutId: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args): Promise<WebhookResult> => {
        const provider = "creem";

        const existing = await ctx.db
            .query("webhookEvents")
            .withIndex("by_provider_event", (q) =>
                q.eq("provider", provider).eq("providerEventId", args.providerEventId),
            )
            .unique();

        if (existing) {
            return { outcome: existing.outcome as WebhookOutcome, duplicate: true };
        }

        const outcome = args.type === "checkout.completed"
            ? await fulfillCheckout(ctx, args)
            : await relockRefundedEvent(ctx, { ...args, type: args.type });

        await ctx.db.insert("webhookEvents", {
            provider,
            providerEventId: args.providerEventId,
            type: args.type,
            outcome,
            processedAt: Date.now(),
            details: {
                entityId: args.entityId ?? null,
                eventId: args.eventId ?? null,
                creemOrderId: args.creemOrderId ?? null,
                creemCheckoutId: args.creemCheckoutId ?? null,
            },
        });

        return { outcome, duplicate: false };
    },
});

type WebhookArgs = {
    entityId?: string | null;
    eventId?: string | null;
    creemOrderId?: string | null;
    creemCheckoutId?: string | null;
    /** Provider event type, recorded in the relock audit details. */
    type?: string | null;
};

/** One-time purchase completed: unlock the event, once. */
async function fulfillCheckout(ctx: MutationCtx, args: WebhookArgs): Promise<WebhookOutcome> {
    const eventId = args.eventId ?? null;
    const orderId = args.creemOrderId ?? null;

    // No event in the metadata means a subscription checkout (or a payload we do
    // not own): the component has already stored the subscription, nothing to
    // unlock here.
    if (!eventId || !orderId) return "ignored";

    const event = await ctx.db.normalizeId("events", eventId);
    if (!event) return "ignored";

    const document = await ctx.db.get(event);
    if (!document) return "ignored";

    // Tenant check against the entity *we* wrote into the metadata: an event id
    // from another organization can never be unlocked by somebody else's payment.
    if (!args.entityId || document.organizationId !== args.entityId) {
        return "rejected_cross_tenant";
    }

    // Legacy predicate: `tier = free AND creemOrderId IS NULL`. The second half
    // is what keeps a delayed `checkout.completed` from re-unlocking an event
    // whose payment was already refunded (the refund stored the order id).
    if (document.tier !== "free" || document.creemOrderId) {
        return "already_unlocked";
    }

    await ctx.db.patch(document._id, {
        tier: "celebration",
        unlockedAt: Date.now(),
        creemOrderId: orderId,
        ...(args.creemCheckoutId ? { creemCheckoutId: args.creemCheckoutId } : {}),
    });
    await writeAudit(ctx, {
        action: "event.unlocked",
        organizationId: document.organizationId,
        targetType: "event",
        targetId: document._id,
        details: { provider: "creem", creemOrderId: orderId },
    });
    await writeAudit(ctx, {
        action: "checkout.completed",
        organizationId: document.organizationId,
        targetType: "event",
        targetId: document._id,
        details: { provider: "creem", creemOrderId: orderId },
    });

    return "unlocked";
}

/**
 * Refund or dispute: put the event back on the free tier.
 *
 * Matches by order id first (the normal case, the checkout already completed),
 * then by checkout id — which is why the checkout id is persisted at creation.
 * The order id is kept on the event either way: a late `checkout.completed` then
 * finds `creemOrderId` set and cannot unlock a refunded payment again.
 */
async function relockRefundedEvent(ctx: MutationCtx, args: WebhookArgs): Promise<WebhookOutcome> {
    const orderId = args.creemOrderId ?? null;
    const checkoutId = args.creemCheckoutId ?? null;

    if (!orderId && !checkoutId) return "relock_noop";

    let event = orderId
        ? await ctx.db
            .query("events")
            .withIndex("by_creem_order_id", (q) => q.eq("creemOrderId", orderId))
            .unique()
        : null;

    if (!event && checkoutId) {
        event = await ctx.db
            .query("events")
            .withIndex("by_creem_checkout_id", (q) => q.eq("creemCheckoutId", checkoutId))
            .unique();
    }

    if (!event) return "relock_noop";

    await ctx.db.patch(event._id, {
        tier: "free",
        unlockedAt: undefined,
        ...(orderId ? { creemOrderId: orderId } : {}),
    });
    await writeAudit(ctx, {
        action: "event.relocked",
        organizationId: event.organizationId,
        targetType: "event",
        targetId: event._id,
        details: { provider: "creem", creemOrderId: orderId, creemCheckoutId: checkoutId, type: args.type ?? "refund" },
    });

    return "relocked";
}

/**
 * Everything the billing reconciliation needs, in one read (plan Task 6, Step 4).
 *
 * Identifiers and statuses only: no email, no name, no address. The script
 * compares this against the legacy Neon state and reports mismatches, so the
 * snapshot must be safe to print and to attach to a migration record.
 */
export interface BillingReconcileSnapshot {
    configured: Array<{ tier: PaidTier; productId: string }>;
    organizations: Array<{ id: string; legacyId: string | null; customerId: string | null }>;
    subscriptions: Array<{
        id: string;
        organizationId: string;
        legacyId: string | null;
        customerId: string;
        productId: string;
        status: string;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
        checkoutId: string | null;
    }>;
    events: Array<{
        id: string;
        legacyId: string | null;
        organizationId: string;
        tier: "free" | "celebration";
        creemOrderId: string | null;
        creemCheckoutId: string | null;
        unlockedAt: number | null;
    }>;
}

export const reconcileSnapshot = internalQuery({
    args: {},
    handler: async (ctx): Promise<BillingReconcileSnapshot> => {
        const [organizations, events] = await Promise.all([
            ctx.db.query("organizations").collect(),
            ctx.db.query("events").collect(),
        ]);

        // One billing read per organization, not a component-wide dump: the
        // component has no "list every customer" query, and iterating the tenant
        // list we own is also what keeps the snapshot scoped to our data.
        const billing = await Promise.all(
            organizations.map(async (organization) => {
                const entityId = organization._id as string;
                const customer = await ctx.runQuery(components.creem.lib.getCustomerByEntityId, {
                    entityId,
                });
                // `listAll…` on purpose: ended and expired rows are exactly the
                // ones a reconciliation must not silently skip.
                const subscriptions = await ctx.runQuery(
                    components.creem.lib.listAllUserSubscriptions,
                    { entityId },
                );

                return {
                    organizationId: entityId,
                    legacyId: organization.legacyId ?? null,
                    customerId: customer?.id ?? null,
                    subscriptions: subscriptions.map((subscription) => ({
                        id: subscription.id,
                        customerId: subscription.customerId,
                        productId: subscription.productId,
                        status: subscription.status,
                        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
                        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                        checkoutId: subscription.checkoutId ?? null,
                    })),
                };
            }),
        );

        return {
            configured: (["celebration", "atelier"] as const).flatMap((tier) => {
                const productId = productIdForTier(tier);
                return productId ? [{ tier, productId }] : [];
            }),
            organizations: billing.map(({ organizationId, legacyId, customerId }) => ({
                id: organizationId,
                legacyId,
                customerId,
            })),
            subscriptions: billing.flatMap(({ organizationId, legacyId, subscriptions }) =>
                subscriptions.map((subscription) => ({ ...subscription, organizationId, legacyId })),
            ),
            events: events.map((event) => ({
                id: event._id as string,
                legacyId: event.legacyId ?? null,
                organizationId: event.organizationId as string,
                tier: event.tier,
                creemOrderId: event.creemOrderId ?? null,
                creemCheckoutId: event.creemCheckoutId ?? null,
                unlockedAt: event.unlockedAt ?? null,
            })),
        };
    },
});

/** Latest fulfillment outcomes, newest first (diagnostics and the gate). */
export const recentWebhookEvents = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("webhookEvents")
            .withIndex("by_provider_type")
            .collect();

        return rows
            .sort((left, right) => right.processedAt - left.processedAt)
            .slice(0, args.limit ?? 20)
            .map((row) => ({
                providerEventId: row.providerEventId,
                type: row.type,
                outcome: row.outcome,
                processedAt: row.processedAt,
            }));
    },
});

/**
 * `internal.billing.syncBillingProducts` — pulls the Creem product catalog into
 * the deployment.
 *
 * Run once per environment (`npx convex run billing:syncBillingProducts`), and
 * again whenever a product changes: the component resolves prices and success
 * URLs from its own copy.
 */
export const syncBillingProducts = internalAction({
    args: {},
    handler: async (ctx) => {
        requireCreemConfiguration();
        await creem.syncProducts(ctx);

        const configured = (["celebration", "atelier"] as const)
            .map((tier) => ({ tier, productId: productIdForTier(tier) }))
            .filter((entry) => entry.productId !== null);

        if (configured.length === 0) {
            throw forbidden("BILLING_PRODUCT_NOT_CONFIGURED", {
                expected: ["CREEM_PRODUCT_ID_CELEBRATION", "CREEM_PRODUCT_ID_ATELIER"],
            });
        }

        return { synced: true, configured };
    },
});

/** Product ids the deployment is configured with — used by the gate, no secrets. */
export const configuredProducts = internalQuery({
    args: {},
    handler: async (): Promise<{ tier: PaidTier; productId: string }[]> => {
        const tiers = ["celebration", "atelier"] as const;

        return tiers.flatMap((tier) => {
            const productId = productIdForTier(tier);
            return productId ? [{ tier: tier as PaidTier, productId }] : [];
        });
    },
});
