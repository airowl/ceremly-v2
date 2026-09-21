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

/** Upload lifecycle of a `files` row (plan Task 7). */
const uploadStatus = v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("failed"),
);

/**
 * Variant pipeline state of a processable original (plan Task 7, Step 3).
 *
 * `none` is the terminal state of anything that is not an image (and of the
 * variant rows themselves); `failed` is terminal and visible, never a silent
 * empty result — an image that could not be processed must be distinguishable
 * from one that needs no processing.
 */
const variantStatus = v.union(
    v.literal("none"),
    v.literal("pending"),
    v.literal("processing"),
    v.literal("ready"),
    v.literal("retrying"),
    v.literal("failed"),
);

const fileVariantType = v.union(
    v.literal("original"),
    v.literal("thumb"),
    v.literal("web"),
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

    /**
     * Files and their image variants (plan Task 7, spike G08).
     *
     * The R2 bucket, the object keys and the `{basePath}/thumb.webp` /
     * `{basePath}/web.webp` layout are **unchanged** from the legacy app: this
     * table replaces the Neon `file` row, not the objects. `path` holds the R2
     * key of this object; `basePath` is the stable directory shared by the
     * original and its variants (which is what lets a variant be written without
     * re-deriving the key from the original name).
     *
     * A pending presigned upload exists *before* the bytes do (legacy parity: the
     * checkout id / file row is written before payment / upload so a later step
     * can still find it), which is why `uploadStatus` and `presignExpiresAt` are
     * part of the row rather than a separate table.
     *
     * Every index a query uses starts with `organizationId` where the query is
     * tenant-scoped: `by_org_sha256` is the dedup key, `by_org_pending` is the
     * presign sweep, `by_variant_status` drives retry/admin.
     */
    files: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        uploadedBy: v.optional(v.id("appUsers")),
        originalName: v.string(),
        mimeType: v.string(),
        fileType: v.string(),
        size: v.number(),
        /** R2 object key of this object (original or variant). */
        path: v.string(),
        /** Stable directory of the original; variants live beside it. */
        basePath: v.string(),
        url: v.optional(v.union(v.string(), v.null())),
        isPublic: v.boolean(),
        isActive: v.boolean(),
        uploadStatus,
        presignExpiresAt: v.optional(v.number()),
        /** Content digest; the dedup key with `organizationId`. */
        sha256: v.optional(v.string()),
        variantOf: v.optional(v.id("files")),
        variantType: fileVariantType,
        variantStatus,
        variantAttempts: v.number(),
        variantError: v.optional(v.string()),
        variantUpdatedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_org_sha256", ["organizationId", "sha256"])
        .index("by_org_upload_status", ["organizationId", "uploadStatus"])
        .index("by_org_variant_status", ["organizationId", "variantStatus"])
        .index("by_variant_of", ["variantOf"])
        .index("by_variant_status", ["variantStatus", "variantUpdatedAt"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Fixed-window rate limit counters (plan Task 8, spike G09).
     *
     * One row per `(bucket, keyHash, windowStart)`: the window is aligned to the
     * epoch (`floor(now / windowMs) * windowMs`), so "the current window" is a
     * point lookup on an index rather than a scan, and the counter cannot be
     * reset by a caller who picks a different key shape. `keyHash` is the SHA-256
     * of the caller-supplied identifier — the raw value (an IP, an email) is
     * never persisted, which is what makes storing counters compatible with the
     * GDPR posture of the rest of the app.
     *
     * The row is the *only* state: the legacy limiter was `get` then `set` across
     * two round trips, so two concurrent requests could both read the same count
     * and both be admitted. Here the check and the increment are one document
     * write inside one Convex transaction, which is what makes the limit hold
     * under concurrency.
     *
     * `by_expires_at` exists for the sweep: buckets are cheap but not free, and a
     * long tail of one-hit windows must not accumulate forever.
     */
    rateLimitBuckets: defineTable({
        bucket: v.string(),
        keyHash: v.string(),
        windowStart: v.number(),
        windowMs: v.number(),
        limit: v.number(),
        count: v.number(),
        expiresAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_bucket_key_window", ["bucket", "keyHash", "windowStart"])
        .index("by_expires_at", ["expiresAt"]),
});
