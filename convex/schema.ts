import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Application schema. Better Auth owns identity in its own component, Creem owns
// billing state in its own component (Task 4): what is defined here is the
// application domain only.
//
// Task 5 adds the tenant spine: `appUsers` (the application profile of a Better
// Auth user), `organizations`, `memberships`, `invitations` and `auditLogs`.
// Every tenant-scoped table carries `organizationId` and every index that a
// query uses starts with it, so an unscoped read is a compile-time mistake
// rather than a leak.

const organizationRole = v.union(
    v.literal("owner"),
    v.literal("admin"),
    v.literal("member"),
);

const invitationStatus = v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected"),
    v.literal("canceled"),
    v.literal("expired"),
);

export default defineSchema({
    migrationHealth: defineTable({
        key: v.string(),
        value: v.string(),
        updatedAt: v.number(),
    }).index("by_key", ["key"]),

    /**
     * Application profile of a Better Auth user.
     *
     * The Better Auth component's `user` table has a fixed schema (no custom
     * fields, no `role` column — measured in Task 4), so `globalRole`, `locale`
     * and the active organization live here. `email` is a normalized copy: the
     * organization domain needs to answer "is this email already a member?" and
     * "was this invitation addressed to me?" without a component round trip,
     * and Better Auth always compares lower-cased addresses.
     */
    appUsers: defineTable({
        authUserId: v.string(),
        email: v.string(),
        legacyId: v.optional(v.string()),
        globalRole: v.union(v.literal("user"), v.literal("superAdmin")),
        locale: v.string(),
        activeOrganizationId: v.optional(v.id("organizations")),
    })
        .index("by_auth_user", ["authUserId"])
        .index("by_email", ["email"])
        .index("by_legacy_id", ["legacyId"]),

    organizations: defineTable({
        legacyId: v.optional(v.string()),
        name: v.string(),
        slug: v.string(),
        logo: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_slug", ["slug"])
        .index("by_legacy_id", ["legacyId"]),

    memberships: defineTable({
        organizationId: v.id("organizations"),
        userId: v.id("appUsers"),
        role: organizationRole,
        createdAt: v.number(),
    })
        .index("by_org_user", ["organizationId", "userId"])
        .index("by_organization_role", ["organizationId", "role"])
        .index("by_user", ["userId"]),

    invitations: defineTable({
        organizationId: v.id("organizations"),
        email: v.string(),
        role: organizationRole,
        status: invitationStatus,
        /** SHA-256 of the invite token: the plaintext token is never persisted. */
        tokenHash: v.string(),
        inviterUserId: v.id("appUsers"),
        expiresAt: v.number(),
        createdAt: v.number(),
        acceptedAt: v.optional(v.number()),
        acceptedByUserId: v.optional(v.id("appUsers")),
        canceledAt: v.optional(v.number()),
    })
        .index("by_token_hash", ["tokenHash"])
        .index("by_org_status", ["organizationId", "status"])
        .index("by_org_email", ["organizationId", "email"])
        .index("by_email", ["email"]),

    /**
     * Minimal `events` slice for the billing spike (plan Task 6, Step 1).
     *
     * Task 10 completes this table with the invitation/RSVP fields **without
     * renaming** what is here: `tier` is the one-time event state (`free` →
     * `celebration`), `creemOrderId` links a refund back to the event to re-lock,
     * `creemCheckoutId` is persisted when the checkout is created so a refund
     * that arrives before `checkout.completed` can still find its event.
     */
    events: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        tier: v.union(v.literal("free"), v.literal("celebration")),
        creemOrderId: v.optional(v.string()),
        creemCheckoutId: v.optional(v.string()),
        unlockedAt: v.optional(v.number()),
    })
        .index("by_organization", ["organizationId"])
        .index("by_creem_order_id", ["creemOrderId"])
        .index("by_creem_checkout_id", ["creemCheckoutId"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Webhook replay ledger.
     *
     * The Creem component keeps no event log of its own, so nothing else stops a
     * redelivered webhook from running the fulfillment twice. One row per
     * (provider, providerEventId) makes the side effect exactly-once: a replay
     * finds the row and returns the recorded outcome without touching any state.
     */
    webhookEvents: defineTable({
        provider: v.string(),
        providerEventId: v.string(),
        type: v.string(),
        outcome: v.union(
            v.literal("unlocked"),
            v.literal("already_unlocked"),
            v.literal("relocked"),
            v.literal("relock_noop"),
            v.literal("ignored"),
            v.literal("rejected_cross_tenant"),
        ),
        processedAt: v.number(),
        details: v.optional(v.any()),
    })
        .index("by_provider_event", ["provider", "providerEventId"])
        .index("by_provider_type", ["provider", "type"]),

    auditLogs: defineTable({
        actorAppUserId: v.optional(v.id("appUsers")),
        actorAuthUserId: v.optional(v.string()),
        organizationId: v.optional(v.id("organizations")),
        category: v.string(),
        action: v.string(),
        targetType: v.optional(v.string()),
        targetId: v.optional(v.string()),
        status: v.union(v.literal("success"), v.literal("failure")),
        details: v.optional(v.any()),
        createdAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_actor", ["actorAppUserId"])
        .index("by_action", ["action"])
        .index("by_created_at", ["createdAt"]),
});
