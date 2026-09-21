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
