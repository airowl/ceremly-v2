import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { eventFixture, initConvexTest } from "./test.setup";
import { buildCheckoutMetadata, isAtelierSubscription, type WebhookOutcome } from "./billing";

/**
 * G07 — organization-scoped Creem billing (plan Task 6).
 *
 * The suite never talks to Creem: what it proves is the part that must be right
 * before any money moves — who may start a charge, which entity is charged, and
 * that a redelivered webhook cannot unlock an event twice or unlock somebody
 * else's.
 *
 * The billing entity is always the caller's active organization, so the tests are
 * written as adversarial cases: a foreign event id, a forged metadata key, a
 * replay, a refund that arrives before the completion, a late completion after a
 * refund.
 */

// Product ids exist on a real deployment; here they only have to be stable so the
// reverse mapping can be exercised. `CREEM_API_KEY` is deliberately absent: the
// suite asserts that every refusal happens *before* the provider is needed.
process.env.CREEM_PRODUCT_ID_CELEBRATION = "prod_test_celebration";
process.env.CREEM_PRODUCT_ID_ATELIER = "prod_test_atelier";

// Task 14 (part b): `inviteMember` derives the invitation token from the id with
// the Better Auth secret (`convex/lib/invitationToken.ts`), so any suite that
// invites needs one. The value only has to be stable within the file.
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-invitation-tokens";

// The Creem client captures the signing secret when its module is first
// evaluated, so the value has to exist *before* the imports above run. `vi.hoisted`
// is the only hook that executes above them, which is why the env lives here and
// not next to the other one.
const { WEBHOOK_SECRET } = vi.hoisted(() => {
    const secret = "whsec_hermetic_pipeline";
    process.env.CREEM_WEBHOOK_SECRET = secret;
    return { WEBHOOK_SECRET: secret };
});

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;

const owner = { subject: "auth_owner", email: "Owner@Example.com", name: "Owner" };
const member = { subject: "auth_member", email: "member@example.com", name: "Member" };

const session = (t: Test, user: typeof owner): Session =>
    t.withIdentity({
        subject: user.subject,
        email: user.email,
        ...(user.name ? { name: user.name } : {}),
    });

async function bootstrap() {
    const t = initConvexTest();
    register(t);

    const ownerSession = session(t, owner);
    const ownerAccount = await ownerSession.mutation(api.organizations.ensureProvisioned, {});

    return { t, ownerSession, organizationId: ownerAccount.organizationId };
}

const insertEvent = (
    ctx: Test,
    organizationId: Id<"organizations">,
    fields: Partial<{ tier: "free" | "celebration"; creemOrderId: string; creemCheckoutId: string }> = {},
) =>
    ctx.run(async (c) =>
        await c.db.insert(
            "events",
            eventFixture(organizationId, {
                tier: fields.tier ?? "free",
                ...(fields.creemOrderId ? { creemOrderId: fields.creemOrderId } : {}),
                ...(fields.creemCheckoutId ? { creemCheckoutId: fields.creemCheckoutId } : {}),
            }),
        ),
    );

const eventById = (ctx: Test, eventId: Id<"events">) =>
    ctx.run(async (c) => c.db.get(eventId));

const auditActions = async (ctx: Test): Promise<string[]> =>
    (await ctx.run(async (c) => c.db.query("auditLogs").collect())).map((row) => row.action);

const webhookRows = (ctx: Test) =>
    ctx.run(async (c) => c.db.query("webhookEvents").collect());

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown = undefined;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }

    expect(caught, `expected rejection with ${code}, but the call resolved`).toBeDefined();
    const data = (caught as { data?: { code?: unknown } }).data;
    expect(data?.code, `expected code ${code}, got ${JSON.stringify(data ?? caught)}`).toBe(code);
}

const processEvent = (t: Test, args: Record<string, unknown>) =>
    t.mutation(internal.billing.processWebhookEvent, {
        providerEventId: "evt_1",
        type: "checkout.completed",
        ...args,
    } as never);

// ---------------------------------------------------------------------------
// Authorization and billing entity
// ---------------------------------------------------------------------------

describe("checkout authorization", () => {
    it("refuses anonymous and non-owner callers before the provider is needed", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        // No identity at all.
        await expectCode(t.action(api.billing.checkoutsCreate, { tier: "atelier" }), "UNAUTHENTICATED");

        // A member of the same organization: allowed to see the plan, not to pay.
        const invite = await ownerSession.mutation(api.organizations.inviteMember, {
            email: member.email,
            role: "member",
        });
        const memberSession = session(t, member);
        await memberSession.mutation(api.organizations.ensureProvisioned, {});
        await memberSession.mutation(api.organizations.acceptInvitation, { token: invite.token });

        await expectCode(
            memberSession.action(api.billing.checkoutsCreate, { tier: "celebration", eventId }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(memberSession.action(api.billing.customersPortalUrl, {}), "INSUFFICIENT_ROLE");

        // The owner gets past authorization and stops at the missing provider
        // credential — proof that no provider call happens before the guards.
        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, { tier: "celebration", eventId }),
            "CREEM_API_KEY_NOT_CONFIGURED",
        );
        await expectCode(ownerSession.action(api.billing.customersPortalUrl, {}), "CREEM_API_KEY_NOT_CONFIGURED");
    });

    it("does not accept an entityId from the client", async () => {
        const { ownerSession, organizationId } = await bootstrap();

        // The parameter does not exist: argument validation rejects it, so a
        // forged billing entity can never reach Creem.
        await expect(
            ownerSession.action(api.billing.checkoutsCreate, {
                tier: "atelier",
                entityId: organizationId,
            } as never),
        ).rejects.toThrow();

        await expect(
            ownerSession.action(api.billing.checkoutsCreate, {
                tier: "atelier",
                convexBillingEntityId: organizationId,
            } as never),
        ).rejects.toThrow();
    });

    it("keeps the reserved checkout metadata keys out of reach", () => {
        const metadata = buildCheckoutMetadata({
            userId: "auth_owner",
            entityId: "org_real",
            metadata: {
                convexBillingEntityId: "org_forged",
                convexUserId: "auth_somebody_else",
                eventId: "event_1",
            },
        });

        expect(metadata.convexBillingEntityId).toBe("org_real");
        expect(metadata.convexUserId).toBe("auth_owner");
        // Non-reserved keys pass through, which is how the event link is made.
        expect(metadata.eventId).toBe("event_1");
    });

    it("requires an event for a celebration checkout and refuses a foreign one", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();
        const otherOrgId = await t.run(async (c) =>
            c.db.insert("organizations", { name: "Other", slug: "other", createdAt: Date.now() }),
        );

        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, { tier: "celebration" }),
            "EVENT_REQUIRED",
        );

        const foreignEvent = await insertEvent(t, otherOrgId);
        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, {
                tier: "celebration",
                eventId: foreignEvent,
            }),
            "EVENT_NOT_FOUND",
        );

        // The same guard is what the fulfillment relies on; check it directly too.
        await expectCode(
            ownerSession.query(internal.billing.assertCelebrationPurchasable, {
                organizationId,
                eventId: foreignEvent,
            }),
            "EVENT_NOT_FOUND",
        );
    });

    it("refuses to sell celebration for an event that is already unlocked", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId, { tier: "celebration" });

        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, { tier: "celebration", eventId }),
            "EVENT_ALREADY_UNLOCKED",
        );
    });

    it("does not sell celebration to an organization that already has atelier", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);
        await grantAtelier(t, organizationId);

        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, { tier: "celebration", eventId }),
            "ORG_HAS_ATELIER",
        );
        await expectCode(
            ownerSession.action(api.billing.checkoutsCreate, { tier: "atelier" }),
            "CREEM_API_KEY_NOT_CONFIGURED",
        );
    });

    it("refuses to record a checkout for an event of another organization", async () => {
        const { t, organizationId } = await bootstrap();
        const otherOrgId = await t.run(async (c) =>
            c.db.insert("organizations", { name: "Other", slug: "other-2", createdAt: Date.now() }),
        );
        const foreignEvent = await insertEvent(t, otherOrgId);

        await expectCode(
            t.mutation(internal.billing.recordCheckoutCreation, {
                organizationId,
                appUserId: await t.run(async (c) => {
                    const user = await c.db.query("appUsers").first();
                    return user!._id;
                }),
                authUserId: owner.subject,
                tier: "celebration",
                productId: "prod_test_celebration",
                checkoutId: "checkout_1",
                eventId: foreignEvent,
            }),
            "EVENT_NOT_FOUND",
        );
    });
});

// ---------------------------------------------------------------------------
// Plan resolution
// ---------------------------------------------------------------------------

/** Grants the organization an Atelier subscription, as a webhook would. */
async function grantAtelier(
    t: Test,
    organizationId: Id<"organizations">,
    overrides: Partial<{ status: string; productId: string }> = {},
) {
    await t.run(async (ctx) => {
        await ctx.runMutation(components.creem.lib.insertCustomer, {
            id: `cust_${organizationId}`,
            entityId: organizationId,
            email: owner.email.toLowerCase(),
        });
        await ctx.runMutation(components.creem.lib.createSubscription, {
            subscription: {
                id: `sub_${organizationId}`,
                customerId: `cust_${organizationId}`,
                productId: overrides.productId ?? process.env.CREEM_PRODUCT_ID_ATELIER!,
                status: overrides.status ?? "active",
                amount: 2400,
                currency: "EUR",
                recurringInterval: "every-month",
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
                cancelAtPeriodEnd: false,
                startedAt: new Date().toISOString(),
                endedAt: null,
                checkoutId: null,
                metadata: {},
                createdAt: new Date().toISOString(),
                modifiedAt: null,
            },
        });
    });
}

describe("plan for the active organization", () => {
    it("is free with free limits, and readable by a member", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();

        const plan = await ownerSession.query(api.billing.planForActiveOrganization, {});

        expect(plan.organizationId).toBe(organizationId);
        expect(plan.plan).toBe("free");
        expect(plan.limits.maxActiveEvents).toBe(1);
        expect(plan.limits.unlimited).toBe(false);
        expect(plan.subscription).toBeNull();
        expect(plan.canManageBilling).toBe(true);

        const invite = await ownerSession.mutation(api.organizations.inviteMember, {
            email: member.email,
            role: "member",
        });
        const memberSession = session(t, member);
        await memberSession.mutation(api.organizations.ensureProvisioned, {});
        await memberSession.mutation(api.organizations.acceptInvitation, { token: invite.token });

        const memberPlan = await memberSession.query(api.billing.planForActiveOrganization, {});
        expect(memberPlan.plan).toBe("free");
        expect(memberPlan.canManageBilling).toBe(false);
    });

    it("is atelier while the subscription is active, and back to free when it ends", async () => {
        const { t, ownerSession, organizationId } = await bootstrap();

        await grantAtelier(t, organizationId);

        const active = await ownerSession.query(api.billing.planForActiveOrganization, {});
        expect(active.plan).toBe("atelier");
        expect(active.limits.unlimited).toBe(true);
        expect(active.limits.maxActiveEvents).toBe(-1);
        expect(active.subscription?.productId).toBe(process.env.CREEM_PRODUCT_ID_ATELIER);
        expect(active.customer?.email).toBe(owner.email.toLowerCase());

        // A canceled subscription stops being atelier without any code running.
        await t.run(async (ctx) => {
            await ctx.runMutation(components.creem.lib.patchSubscription, {
                subscriptionId: `sub_${organizationId}`,
                status: "canceled",
            });
        });

        const canceled = await ownerSession.query(api.billing.planForActiveOrganization, {});
        expect(canceled.plan).toBe("free");
    });

    it("does not mistake another recurring product for atelier", () => {
        expect(isAtelierSubscription({ status: "active", productId: process.env.CREEM_PRODUCT_ID_ATELIER })).toBe(true);
        expect(isAtelierSubscription({ status: "trialing", productId: process.env.CREEM_PRODUCT_ID_ATELIER })).toBe(true);
        expect(isAtelierSubscription({ status: "canceled", productId: process.env.CREEM_PRODUCT_ID_ATELIER })).toBe(false);
        expect(isAtelierSubscription({ status: "active", productId: "prod_something_else" })).toBe(false);
        expect(isAtelierSubscription(null)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Webhook fulfillment
// ---------------------------------------------------------------------------

describe("webhook fulfillment", () => {
    it("unlocks the event once and records the ledger row", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId, { creemCheckoutId: "checkout_1" });

        const result = await processEvent(t, {
            entityId: organizationId,
            eventId,
            creemOrderId: "order_1",
            creemCheckoutId: "checkout_1",
        });

        expect(result).toEqual({ outcome: "unlocked", duplicate: false });

        const event = await eventById(t, eventId);
        expect(event?.tier).toBe("celebration");
        expect(event?.creemOrderId).toBe("order_1");
        expect(event?.creemCheckoutId).toBe("checkout_1");
        expect(event?.unlockedAt).toBeGreaterThan(0);

        expect((await webhookRows(t)).map((row) => row.outcome)).toEqual(["unlocked"]);
        expect(await auditActions(t)).toContain("event.unlocked");
        expect(await auditActions(t)).toContain("checkout.completed");
    });

    it("does not apply a redelivered webhook twice", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        const first = await processEvent(t, { entityId: organizationId, eventId, creemOrderId: "order_1" });
        const auditAfterFirst = await auditActions(t);
        const unlockedAt = (await eventById(t, eventId))?.unlockedAt;

        const replay = await processEvent(t, { entityId: organizationId, eventId, creemOrderId: "order_1" });

        expect(first.outcome).toBe("unlocked");
        expect(replay).toEqual({ outcome: "unlocked", duplicate: true });

        // No second ledger row, no second audit, no second write.
        expect(await webhookRows(t)).toHaveLength(1);
        expect(await auditActions(t)).toHaveLength(auditAfterFirst.length);
        expect((await eventById(t, eventId))?.unlockedAt).toBe(unlockedAt);
    });

    it("ignores a differently identified event that carries the same order", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        await processEvent(t, { entityId: organizationId, eventId, creemOrderId: "order_1" });
        const auditCount = (await auditActions(t)).length;

        const second = await processEvent(t, {
            providerEventId: "evt_2",
            entityId: organizationId,
            eventId,
            creemOrderId: "order_1",
        });

        expect(second).toEqual({ outcome: "already_unlocked", duplicate: false });
        expect((await auditActions(t)).length).toBe(auditCount);
        expect(await webhookRows(t)).toHaveLength(2);
    });

    it("refuses to unlock another organization's event", async () => {
        const { t, organizationId } = await bootstrap();
        const otherOrgId = await t.run(async (c) =>
            c.db.insert("organizations", { name: "Other", slug: "other-3", createdAt: Date.now() }),
        );
        const foreignEvent = await insertEvent(t, otherOrgId);

        const result = await processEvent(t, {
            entityId: organizationId,
            eventId: foreignEvent,
            creemOrderId: "order_1",
        });

        expect(result.outcome).toBe("rejected_cross_tenant");
        expect((await eventById(t, foreignEvent))?.tier).toBe("free");
        expect(await auditActions(t)).not.toContain("event.unlocked");
    });

    it("ignores subscription checkouts and unknown events", async () => {
        const { t, organizationId } = await bootstrap();

        // An Atelier checkout has no event in its metadata.
        const subscriptionCheckout = await processEvent(t, {
            entityId: organizationId,
            creemOrderId: "order_1",
        });
        expect(subscriptionCheckout.outcome).toBe("ignored");

        const unknownEvent = await processEvent(t, {
            providerEventId: "evt_unknown",
            entityId: organizationId,
            eventId: "not-an-event-id",
            creemOrderId: "order_2",
        });
        expect(unknownEvent.outcome).toBe("ignored");
    });

    it("re-locks a refunded event and keeps the order recorded", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        await processEvent(t, { entityId: organizationId, eventId, creemOrderId: "order_1" });

        const refund = await processEvent(t, {
            providerEventId: "evt_refund",
            type: "refund.created",
            creemOrderId: "order_1",
        });

        expect(refund).toEqual({ outcome: "relocked", duplicate: false });
        const event = await eventById(t, eventId);
        expect(event?.tier).toBe("free");
        expect(event?.unlockedAt).toBeUndefined();
        // The order stays on the event: a late completion must not re-unlock it.
        expect(event?.creemOrderId).toBe("order_1");
        expect(await auditActions(t)).toContain("event.relocked");
    });

    it("blocks a late completion after a refund that arrived first", async () => {
        const { t, organizationId } = await bootstrap();
        // The checkout id was persisted when the checkout was created, before the
        // customer could pay — this is the legacy Fix 7.2 scenario.
        const eventId = await insertEvent(t, organizationId, { creemCheckoutId: "checkout_1" });

        const refund = await processEvent(t, {
            providerEventId: "evt_refund",
            type: "refund.created",
            creemCheckoutId: "checkout_1",
            creemOrderId: "order_1",
        });
        expect(refund.outcome).toBe("relocked");
        expect((await eventById(t, eventId))?.creemOrderId).toBe("order_1");

        const lateCompletion = await processEvent(t, {
            providerEventId: "evt_completed",
            entityId: organizationId,
            eventId,
            creemOrderId: "order_1",
        });

        expect(lateCompletion.outcome).toBe("already_unlocked");
        expect((await eventById(t, eventId))?.tier).toBe("free");
    });

    it("records a refund with no matching event as a no-op", async () => {
        const { t } = await bootstrap();

        const result = await processEvent(t, {
            providerEventId: "evt_refund_orphan",
            type: "refund.created",
            creemOrderId: "order_unknown",
            creemCheckoutId: "checkout_unknown",
        });

        expect(result.outcome).toBe("relock_noop");
        expect(await auditActions(t)).not.toContain("event.relocked");
        expect((await webhookRows(t)).map((row) => row.outcome)).toEqual(["relock_noop"]);
    });
});

// ---------------------------------------------------------------------------
// Ledger shape
// ---------------------------------------------------------------------------

describe("webhook ledger", () => {
    it("keeps one row per provider event id and the outcome of the first attempt", async () => {
        const outcomes: WebhookOutcome[] = ["unlocked", "relocked"];

        expect(outcomes).toEqual(["unlocked", "relocked"]);

        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        await processEvent(t, { entityId: organizationId, eventId, creemOrderId: "order_1" });

        const rows = await webhookRows(t);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.provider).toBe("creem");
        expect(rows[0]?.providerEventId).toBe("evt_1");
        expect(rows[0]?.type).toBe("checkout.completed");
        expect(rows[0]?.processedAt).toBeGreaterThan(0);
        expect(rows[0]?.details).toMatchObject({ creemOrderId: "order_1" });
    });
});

// ---------------------------------------------------------------------------
// HTTP pipeline: signature → SDK parser → fulfillment
// ---------------------------------------------------------------------------

/**
 * The regression this pins: a webhook reaches `/creem/events` as a raw request,
 * `registerRoutes` verifies the signature and runs the SDK's
 * `webhookEventEntityFromJSON` over the body — which renames Creem's snake_case
 * fields to camelCase and turns `created_at` into a number.
 *
 * An earlier version of `normalizeCreemEvent` fed that *already parsed* object
 * back through the SDK's checkout parser, which still requires the raw
 * `created_at` the first pass had removed; it returned `null`, so every real
 * checkout was recorded as `ignored` (measured on staging before this gate
 * existed). Calling `t.fetch` exercises the actual route, the actual signature
 * check and the actual parser, none of which a direct call to
 * `processWebhookEvent` can reach.
 */
describe("webhook HTTP pipeline", () => {
    const checkoutCompleted = (args: {
        eventId: string;
        organizationId: string;
        authUserId: string;
        providerEventId: string;
        orderId: string;
        checkoutId: string;
    }) => ({
        id: args.providerEventId,
        eventType: "checkout.completed",
        created_at: Math.floor(Date.now() / 1000),
        object: {
            id: args.checkoutId,
            mode: "test",
            object: "checkout",
            status: "completed",
            product: process.env.CREEM_PRODUCT_ID_CELEBRATION!,
            units: 1,
            order: {
                id: args.orderId,
                mode: "test",
                object: "order",
                product: process.env.CREEM_PRODUCT_ID_CELEBRATION!,
                amount: 4900,
                currency: "EUR",
                status: "paid",
                type: "onetime",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            customer: `cust_${args.organizationId}`,
            metadata: {
                convexUserId: args.authUserId,
                convexBillingEntityId: args.organizationId,
                eventId: args.eventId,
            },
        },
    });

    const postSigned = (t: Test, payload: unknown): Promise<Response> => {
        const body = JSON.stringify(payload);
        const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
        return t.fetch("/creem/events", {
            method: "POST",
            headers: { "content-type": "application/json", "creem-signature": signature },
            body,
        });
    };

    it("verifies the signature, parses the wire payload and unlocks the event", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);

        const response = await postSigned(
            t,
            checkoutCompleted({
                eventId,
                organizationId,
                authUserId: owner.subject,
                providerEventId: "evt_pipeline_1",
                orderId: "order_pipeline_1",
                checkoutId: "checkout_pipeline_1",
            }),
        );

        expect(response.status).toBe(202);

        const event = await eventById(t, eventId);
        expect(event?.tier).toBe("celebration");
        expect(event?.creemOrderId).toBe("order_pipeline_1");
        expect(event?.creemCheckoutId).toBe("checkout_pipeline_1");
        expect((await webhookRows(t)).map((row) => row.outcome)).toEqual(["unlocked"]);
        expect(await auditActions(t)).toContain("event.unlocked");
    });

    it("applies a redelivery of the same signed request only once", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);
        const payload = checkoutCompleted({
            eventId,
            organizationId,
            authUserId: owner.subject,
            providerEventId: "evt_pipeline_1",
            orderId: "order_pipeline_1",
            checkoutId: "checkout_pipeline_1",
        });

        await postSigned(t, payload);
        const unlockedAt = (await eventById(t, eventId))?.unlockedAt;

        const response = await postSigned(t, payload);

        expect(response.status).toBe(202);
        expect(await webhookRows(t)).toHaveLength(1);
        expect((await eventById(t, eventId))?.unlockedAt).toBe(unlockedAt);
    });

    it("rejects a request whose signature does not match the secret", async () => {
        const { t, organizationId } = await bootstrap();
        const eventId = await insertEvent(t, organizationId);
        const body = JSON.stringify(
            checkoutCompleted({
                eventId,
                organizationId,
                authUserId: owner.subject,
                providerEventId: "evt_pipeline_1",
                orderId: "order_pipeline_1",
                checkoutId: "checkout_pipeline_1",
            }),
        );

        const response = await t.fetch("/creem/events", {
            method: "POST",
            headers: { "content-type": "application/json", "creem-signature": "00".repeat(32) },
            body,
        });

        expect(response.status).toBe(403);
        expect((await eventById(t, eventId))?.tier).toBe("free");
        expect(await webhookRows(t)).toHaveLength(0);
    });
});
