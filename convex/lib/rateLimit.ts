import { ConvexError, v } from "convex/values";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { sha256Hex } from "./bridgeHmac";

/**
 * Server-side rate limiting (plan Task 8, spike G09).
 *
 * The legacy limiter lived in the request path on Vercel and was built from the
 * primitives that environment offered: `INCR` + `EXPIRE` on Upstash for the
 * public forms, and a plain `get`-then-`set` for uploads — which is not atomic,
 * so two concurrent uploads could both read the same count and both pass. Convex
 * gives a stronger primitive: a mutation reads and writes the counter document
 * in one serializable transaction, so the limit holds no matter how the requests
 * interleave, and it holds without a second network hop to a cache.
 *
 * Two shapes are deliberate:
 *
 * - `assertRateLimit(ctx, …)` is what a domain function calls. It delegates to the
 *   internal mutation below via `ctx.runMutation`, so there is exactly one
 *   implementation of the counting rule and the caller does not re-implement it.
 *   Note the transaction boundary, because it differs by caller type: from a
 *   **mutation** the nested call joins the caller's transaction, so the increment
 *   and the domain write commit or fail together; from an **action** it is its own
 *   transaction, committed when the call returns — so a refusal aborts the action
 *   before any side effect, while a granted unit stays consumed even if the action
 *   fails afterwards. That is the correct direction for both (an abused caller
 *   cannot get a free retry, and a failed bridge call has already hit the bucket).
 * - `consume` returns a decision instead of throwing, so a caller that wants to
 *   answer 200-with-a-warning (or to keep the check outside its own failure path)
 *   can do that. `assertRateLimit` is the throwing wrapper.
 *
 * Refusals are deliberately **not** audited: a limiter's job is to absorb abuse
 * that has not identified itself, and writing an `auditLogs` row per refused
 * request would let an unauthenticated flood grow a table — the counter row is
 * the durable record. Callers that *do* know who was refused (the admin bucket)
 * audit it themselves.
 */

export const RATE_LIMIT_CODE = "RATE_LIMITED";

/**
 * The buckets the application may use, with the key each one expects.
 *
 * `subject` is not decoration: it is the contract for what `key` has to be, and
 * it is what the protection matrix documents. A caller that passes an email into
 * `rsvp` (whose key is a guest token) would create a second, weaker limiter
 * rather than an error, so the hint is written down where the limit is declared.
 *
 * Numbers mirror the legacy behaviour instead of inventing stricter ones:
 * `rsvp` 30/min and `contact`/`waitingList` 5/hour are the constants the Nuxt
 * routes used, and `filePresign` 100/min is `fileManager.uploadRateLimit`
 * (`maxUploadsPerWindow: 100`, `windowSizeMinutes: 1`). A migration must not
 * silently throttle what production allows.
 */
export const RATE_LIMIT_POLICY = {
    /** Better Auth's in-app limit; the edge limiter is documented in the matrix. */
    auth: { limit: 20, windowMs: 60_000, subject: "IP + path" },
    /** Public RSVP: the guest token, so one invitation cannot be flooded. */
    rsvp: { limit: 30, windowMs: 60_000, subject: "guest token + IP" },
    contact: { limit: 5, windowMs: 3_600_000, subject: "IP + email" },
    waitingList: { limit: 5, windowMs: 3_600_000, subject: "IP + email" },
    filePresign: { limit: 100, windowMs: 60_000, subject: "appUserId + organizationId" },
    fileConfirm: { limit: 200, windowMs: 60_000, subject: "appUserId + organizationId" },
    admin: { limit: 60, windowMs: 60_000, subject: "superAdmin appUserId" },
    /**
     * Organizer email sends (`guests.sendInvites`, `guests.sendTest`), final review
     * M2. The legacy routes sat behind the global 100 req/min middleware
     * (`3.rate-limit.ts`), which does not exist on Convex; mirrored, not tightened.
     */
    emailSend: { limit: 100, windowMs: 60_000, subject: "appUserId + organizationId" },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_POLICY;

/**
 * The buckets the mutation accepts. Enumerated so an unknown bucket is a
 * validation error at the boundary rather than a silently unlimited namespace.
 */
const bucket = v.union(
    v.literal("auth"),
    v.literal("rsvp"),
    v.literal("contact"),
    v.literal("waitingList"),
    v.literal("filePresign"),
    v.literal("fileConfirm"),
    v.literal("admin"),
    v.literal("emailSend"),
);

export interface RateLimitRequest {
    bucket: RateLimitBucket;
    /** The identifier being limited. Hashed before it is stored. */
    key: string;
    /** Overrides the policy default; used by the tests and by tighter callers. */
    limit?: number;
    windowMs?: number;
}

export interface RateLimitDecision {
    allowed: boolean;
    bucket: RateLimitBucket;
    /** SHA-256 of `key`: what actually reaches the table. */
    keyHash: string;
    /** Count including this call when allowed, the standing count when refused. */
    count: number;
    limit: number;
    remaining: number;
    windowStart: number;
    /** End of the current window; when the count goes back to zero. */
    resetAt: number;
    /** Milliseconds until `resetAt`; `0` when allowed. */
    retryAfterMs: number;
}

/** An empty key would collapse every caller into one shared counter. */
function assertUsableKey(key: string): void {
    if (typeof key !== "string" || key.trim().length === 0) {
        throw new ConvexError({ code: "RATE_LIMIT_KEY_REQUIRED" });
    }
}

/**
 * Consumes one unit of the budget. Never throws for exhaustion: it answers.
 *
 * The whole read-modify-write is one transaction (see the module comment), which
 * is the property the old `get`/`set` limiter lacked.
 */
export const consume = internalMutation({
    args: {
        bucket,
        key: v.string(),
        limit: v.optional(v.number()),
        windowMs: v.optional(v.number()),
        /** Test/backfill hook: the window is otherwise derived from `Date.now()`. */
        now: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<RateLimitDecision> => {
        assertUsableKey(args.key);

        const policy = RATE_LIMIT_POLICY[args.bucket];
        const limit = args.limit ?? policy.limit;
        const windowMs = args.windowMs ?? policy.windowMs;

        if (!Number.isFinite(limit) || limit <= 0) {
            throw new ConvexError({ code: "RATE_LIMIT_INVALID", field: "limit", value: limit });
        }
        if (!Number.isFinite(windowMs) || windowMs <= 0) {
            throw new ConvexError({ code: "RATE_LIMIT_INVALID", field: "windowMs", value: windowMs });
        }

        const keyHash = await sha256Hex(`${args.bucket}\u0000${args.key}`);
        const now = args.now ?? Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;
        const resetAt = windowStart + windowMs;

        const existing = await ctx.db
            .query("rateLimitBuckets")
            .withIndex("by_bucket_key_window", (q) =>
                q
                    .eq("bucket", args.bucket)
                    .eq("keyHash", keyHash)
                    .eq("windowStart", windowStart),
            )
            .unique();

        if (existing && existing.count >= limit) {
            return {
                allowed: false,
                bucket: args.bucket,
                keyHash,
                count: existing.count,
                limit,
                remaining: 0,
                windowStart,
                resetAt,
                retryAfterMs: Math.max(1, resetAt - now),
            };
        }

        const count = (existing?.count ?? 0) + 1;

        if (existing) {
            await ctx.db.patch(existing._id, {
                count,
                limit,
                windowMs,
                expiresAt: resetAt,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert("rateLimitBuckets", {
                bucket: args.bucket,
                keyHash,
                windowStart,
                windowMs,
                limit,
                count,
                expiresAt: resetAt,
                updatedAt: now,
            });
        }

        return {
            allowed: true,
            bucket: args.bucket,
            keyHash,
            count,
            limit,
            remaining: Math.max(0, limit - count),
            windowStart,
            resetAt,
            retryAfterMs: 0,
        };
    },
});

/**
 * Enforces the budget for a domain call, throwing `RATE_LIMITED` when exhausted.
 *
 * The counter is always written by the same internal mutation, whether the caller
 * is an action or a mutation (see the transaction-boundary note above).
 */
export async function assertRateLimit(
    ctx: ActionCtx | MutationCtx,
    request: RateLimitRequest,
): Promise<RateLimitDecision> {
    const decision: RateLimitDecision = await ctx.runMutation(internal.lib.rateLimit.consume, {
        bucket: request.bucket,
        key: request.key,
        ...(request.limit === undefined ? {} : { limit: request.limit }),
        ...(request.windowMs === undefined ? {} : { windowMs: request.windowMs }),
    });

    if (!decision.allowed) {
        throw new ConvexError({
            code: RATE_LIMIT_CODE,
            bucket: decision.bucket,
            limit: decision.limit,
            retryAfterMs: decision.retryAfterMs,
            resetAt: decision.resetAt,
        });
    }

    return decision;
}

/**
 * Deletes expired counters.
 *
 * Called from the cron sweep (Task 13) rather than from a request path: an
 * unbounded delete inside a mutation would fight the transactional size limit,
 * so this removes one bounded batch per invocation.
 */
export const pruneExpired = internalMutation({
    args: { batch: v.optional(v.number()), now: v.optional(v.number()) },
    handler: async (ctx, args): Promise<{ deleted: number; hasMore: boolean }> => {
        const batch = Math.min(Math.max(args.batch ?? 500, 1), 1000);
        const now = args.now ?? Date.now();

        const expired = await ctx.db
            .query("rateLimitBuckets")
            .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
            .take(batch + 1);

        const toDelete = expired.slice(0, batch);
        for (const row of toDelete) {
            await ctx.db.delete(row._id);
        }

        return { deleted: toDelete.length, hasMore: expired.length > batch };
    },
});
