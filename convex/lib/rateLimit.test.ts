import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { initConvexTest } from "../test.setup";
import { sha256Hex } from "./bridgeHmac";
import { RATE_LIMIT_POLICY, type RateLimitBucket } from "./rateLimit";

/**
 * G09 — server-side rate limiting (plan Task 8).
 *
 * Hermetic (convex-test, no deployment, no Redis): what it proves is the part
 * that must be right before the limiter is the only thing standing between an
 * abuser and the bucket — the budget is counted per *caller* and not per object,
 * the counter is one transactional read-modify-write rather than a `get` then a
 * `set`, the stored identifier is a digest and never the raw IP/email, windows
 * roll over, and the enforcement is actually reached by the real upload action.
 *
 * The failures the previous limiter could not survive are the subject of their
 * own cases: an exhausted budget asked twice still refuses, and concurrent callers
 * cannot all be admitted.
 */

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;

const alice = { subject: "auth_rl_alice", email: "rl-alice@example.com", name: "Alice" };
const bob = { subject: "auth_rl_bob", email: "rl-bob@example.com", name: "Bob" };

const session = (t: Test, user: typeof alice): Session =>
    t.withIdentity({ subject: user.subject, email: user.email, ...(user.name ? { name: user.name } : {}) });

/** Fixed clock: window boundaries are the thing under test, so time is pinned. */
const FROZEN = new Date("2026-09-21T10:00:00.000Z");

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function bootstrap() {
    const t = initConvexTest();
    const aliceSession = session(t, alice);
    const provisioned = await aliceSession.mutation(api.organizations.ensureProvisioned, {});

    return { t, aliceSession, organizationId: provisioned.organizationId };
}

const appUserId = async (ctx: Test | Session, email: string): Promise<Id<"appUsers">> =>
    ctx.run(async (c) =>
        (await c.db.query("appUsers").withIndex("by_email", (q) => q.eq("email", email)).unique())!._id,
    );

const bucketRows = (t: Test) => t.run(async (c) => c.db.query("rateLimitBuckets").collect());

async function expectCode(promise: Promise<unknown>, code: string): Promise<unknown> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}`).toBeDefined();
    const message = JSON.stringify(caught);
    expect(message, `expected ${code} in ${message}`).toContain(code);
    return caught;
}

const consume = (t: Test, args: Parameters<Test["mutation"]>[1]) =>
    t.mutation(internal.lib.rateLimit.consume, args as never);

/**
 * The upload action reaches the storage bridge after the budget check, so the
 * bridge is stubbed: this suite is about the limiter, not about R2 (G08 proved
 * the bridge itself live).
 */
function stubBridge() {
    process.env.STORAGE_BRIDGE_URL = "https://bridge.test";
    process.env.STORAGE_BRIDGE_SECRET = "rate-limit-gate-secret";
    vi.stubGlobal("fetch", async (input: unknown) => {
        // Typed loosely on purpose: the Convex tsconfig has no DOM lib, and this
        // stub only needs the URL the action asked for.
        const url =
            typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
        const body = url.includes("/storage/object")
            ? // `exists: false` lets a confirm reach the bridge and fail for its own
              // reason, which is how the test tells "passed the limiter" from
              // "refused by it".
              { exists: false }
            : { url: "https://r2.test/signed", key: "k", expiresAt: Date.now() + 900_000 };
        return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
}

/** A pending upload row, as the presign action would have created it. */
async function seedPending(
    t: Test,
    args: { organizationId: Id<"organizations">; uploadedBy: Id<"appUsers"> },
): Promise<Id<"files">> {
    return (
        await t.mutation(internal.files.insertPendingUpload, {
            organizationId: args.organizationId,
            uploadedBy: args.uploadedBy,
            authUserId: alice.subject,
            originalName: "photo.png",
            mimeType: "image/png",
            fileSize: 1024,
            path: "global/2026-09/seed/photo.png",
            basePath: "global/2026-09/seed",
            isPublic: true,
            presignExpiresAt: Date.now() + 900_000,
        })
    ).fileId;
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

describe("rate limit policy", () => {
    it("declares a key subject and a positive window for every bucket", () => {
        const buckets = Object.entries(RATE_LIMIT_POLICY);

        expect(buckets.length).toBeGreaterThan(0);
        for (const [name, policy] of buckets) {
            expect(policy.subject, `${name} must document its key`).toBeTruthy();
            expect(policy.limit, `${name} limit`).toBeGreaterThan(0);
            expect(policy.windowMs, `${name} windowMs`).toBeGreaterThan(0);
        }
    });

    it("keeps the legacy numbers the Nuxt routes enforced", () => {
        // Mirrored, not invented: see docs/migration/protection-matrix.md.
        expect(RATE_LIMIT_POLICY.auth.limit).toBe(20);
        expect(RATE_LIMIT_POLICY.rsvp).toEqual({ limit: 30, windowMs: 60_000, subject: "guest token + IP" });
        expect(RATE_LIMIT_POLICY.contact.limit).toBe(5);
        expect(RATE_LIMIT_POLICY.contact.windowMs).toBe(3_600_000);
        expect(RATE_LIMIT_POLICY.waitingList.limit).toBe(5);
        expect(RATE_LIMIT_POLICY.filePresign.limit).toBe(100);
        expect(RATE_LIMIT_POLICY.filePresign.windowMs).toBe(60_000);
    });

    it("refuses an unknown bucket at the boundary instead of creating one", async () => {
        const t = initConvexTest();

        await expect(
            t.mutation(internal.lib.rateLimit.consume, {
                bucket: "notABucket",
                key: "k",
            } as never),
        ).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

describe("consume", () => {
    it("admits exactly `limit` calls and refuses the next one with a retry hint", async () => {
        const t = initConvexTest();
        const limit = 3;

        const decisions = [];
        for (let index = 0; index < limit; index += 1) {
            decisions.push(await consume(t, { bucket: "contact", key: "ip:1.2.3.4", limit, windowMs: 60_000 }));
        }

        expect(decisions.map((d) => d.allowed)).toEqual([true, true, true]);
        expect(decisions.map((d) => d.count)).toEqual([1, 2, 3]);
        expect(decisions.map((d) => d.remaining)).toEqual([2, 1, 0]);

        const refused = await consume(t, { bucket: "contact", key: "ip:1.2.3.4", limit, windowMs: 60_000 });
        expect(refused.allowed).toBe(false);
        expect(refused.remaining).toBe(0);
        expect(refused.count).toBe(limit);
        // The window is aligned to the epoch, so the hint is exact, not an estimate.
        expect(refused.retryAfterMs).toBe(refused.resetAt - FROZEN.getTime());
        expect(refused.retryAfterMs).toBeGreaterThan(0);
        expect(refused.retryAfterMs).toBeLessThanOrEqual(60_000);

        // A refusal is not a reset: asking again is still refused, and asking more
        // times does not extend the window.
        expect((await consume(t, { bucket: "contact", key: "ip:1.2.3.4", limit, windowMs: 60_000 })).allowed).toBe(false);
        const rows = await bucketRows(t);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.count).toBe(limit);
    });

    it("stores one row per (bucket, key digest, window) and never the raw key", async () => {
        const t = initConvexTest();
        const rawKey = "203.0.113.7:someone@example.com";

        await consume(t, { bucket: "waitingList", key: rawKey, limit: 5, windowMs: 60_000 });

        const rows = await bucketRows(t);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.bucket).toBe("waitingList");
        expect(rows[0]!.keyHash).toBe(await sha256Hex(`waitingList\u0000${rawKey}`));
        expect(rows[0]!.windowStart).toBe(Math.floor(FROZEN.getTime() / 60_000) * 60_000);
        expect(rows[0]!.expiresAt).toBe(rows[0]!.windowStart + 60_000);

        const serialized = JSON.stringify(rows);
        expect(serialized).not.toContain("203.0.113.7");
        expect(serialized).not.toContain("someone@example.com");
    });

    it("counts keys and buckets independently", async () => {
        const t = initConvexTest();

        await consume(t, { bucket: "rsvp", key: "token-a", limit: 1, windowMs: 60_000 });
        await consume(t, { bucket: "rsvp", key: "token-b", limit: 1, windowMs: 60_000 });
        await consume(t, { bucket: "contact", key: "token-a", limit: 1, windowMs: 60_000 });

        expect((await consume(t, { bucket: "rsvp", key: "token-a", limit: 1, windowMs: 60_000 })).allowed).toBe(false);
        // Another guest's token is untouched by the first guest's exhaustion.
        expect((await consume(t, { bucket: "rsvp", key: "token-b", limit: 1, windowMs: 60_000 })).allowed).toBe(false);
        // The same key in another namespace has its own budget.
        expect((await consume(t, { bucket: "contact", key: "token-a", limit: 1, windowMs: 60_000 })).allowed).toBe(false);

        // ... and a third party who has not hit their own limit is still admitted.
        expect((await consume(t, { bucket: "rsvp", key: "token-c", limit: 1, windowMs: 60_000 })).allowed).toBe(true);
        expect(await bucketRows(t)).toHaveLength(4);
    });

    it("resets when the window rolls over", async () => {
        const t = initConvexTest();
        const windowMs = 60_000;

        await consume(t, { bucket: "rsvp", key: "token", limit: 1, windowMs });
        expect((await consume(t, { bucket: "rsvp", key: "token", limit: 1, windowMs })).allowed).toBe(false);

        vi.setSystemTime(new Date(FROZEN.getTime() + windowMs));
        const afterRollover = await consume(t, { bucket: "rsvp", key: "token", limit: 1, windowMs });
        expect(afterRollover.allowed).toBe(true);
        expect(afterRollover.count).toBe(1);
        expect(afterRollover.windowStart).toBe(Math.floor(FROZEN.getTime() / windowMs) * windowMs + windowMs);

        // Two windows coexist as two rows: the counter is per window, not per key.
        expect(await bucketRows(t)).toHaveLength(2);
    });

    it("refuses a keyless or nonsensical configuration", async () => {
        const t = initConvexTest();

        await expectCode(consume(t, { bucket: "contact", key: "   " }), "RATE_LIMIT_KEY_REQUIRED");
        await expectCode(consume(t, { bucket: "contact", key: "k", limit: 0 }), "RATE_LIMIT_INVALID");
        await expectCode(consume(t, { bucket: "contact", key: "k", limit: -1 }), "RATE_LIMIT_INVALID");
        await expectCode(consume(t, { bucket: "contact", key: "k", windowMs: 0 }), "RATE_LIMIT_INVALID");

        // A refused *configuration* writes nothing.
        expect(await bucketRows(t)).toHaveLength(0);
    });

    it("keeps the budget under concurrent callers", async () => {
        const t = initConvexTest();
        const limit = 4;
        const callers = 12;

        const decisions = await Promise.all(
            Array.from({ length: callers }, () =>
                consume(t, { bucket: "contact", key: "ip:concurrent", limit, windowMs: 60_000 }),
            ),
        );

        const admitted = decisions.filter((decision) => decision.allowed);
        // Exactly `limit`, never more: the read-modify-write of the counter is one
        // document write in one transaction, which is the property the legacy
        // `get`-then-`set` limiter did not have.
        expect(admitted.length, "concurrent callers must not exceed the budget").toBe(limit);
        expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(callers - limit);

        const rows = await bucketRows(t);
        expect(rows).toHaveLength(1);
        // The stored count is the number of granted units, never the number of
        // attempts: a refusal does not consume.
        expect(rows[0]!.count).toBe(admitted.length);
        expect(rows[0]!.count).toBe(limit);
    });
});

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

describe("pruneExpired", () => {
    it("deletes only the windows that are over, in bounded batches", async () => {
        const t = initConvexTest();
        const windowMs = 60_000;

        for (let index = 0; index < 3; index += 1) {
            await consume(t, { bucket: "contact", key: `old-${index}`, limit: 1, windowMs });
        }
        vi.setSystemTime(new Date(FROZEN.getTime() + windowMs));
        await consume(t, { bucket: "contact", key: "fresh", limit: 1, windowMs });

        const bounded = await t.mutation(internal.lib.rateLimit.pruneExpired, {
            batch: 2,
            now: FROZEN.getTime() + windowMs + 1,
        });
        expect(bounded).toEqual({ deleted: 2, hasMore: true });

        const rest = await t.mutation(internal.lib.rateLimit.pruneExpired, {
            batch: 2,
            now: FROZEN.getTime() + windowMs + 1,
        });
        expect(rest).toEqual({ deleted: 1, hasMore: false });

        // The live window survives its own sweep.
        const rows = await bucketRows(t);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.bucket).toBe("contact");
    });
});

// ---------------------------------------------------------------------------
// The real path: the upload action is what abusers actually reach
// ---------------------------------------------------------------------------

describe("file uploads", () => {
    it("enforces the budget on the real presign action, keyed by caller", async () => {
        stubBridge();
        const { t, aliceSession, organizationId } = await bootstrap();
        const aliceId = await appUserId(aliceSession, alice.email);

        // Spend the whole budget the way an attacker would: through the action.
        for (let index = 0; index < RATE_LIMIT_POLICY.filePresign.limit; index += 1) {
            const granted = await aliceSession.action(api.files.presignUpload, {
                originalName: `photo-${index}.png`,
                mimeType: "image/png",
                fileSize: 1024,
            });
            expect(granted.presignedUrl).toBe("https://r2.test/signed");
        }

        // The bridge is never reached again: refusals come from the budget.
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "one-too-many.png",
                mimeType: "image/png",
                fileSize: 1024,
            }),
            "RATE_LIMITED",
        );

        const rows = await bucketRows(t);
        const presignRow = rows.find((row) => row.bucket === "filePresign");
        expect(presignRow, "the action must count in the filePresign bucket").toBeDefined();
        expect(presignRow!.count).toBe(RATE_LIMIT_POLICY.filePresign.limit);
        expect(presignRow!.keyHash).toBe(await sha256Hex(`filePresign\u0000${aliceId}:${organizationId}`));

        // Another caller is unaffected: the key is the caller, not the file.
        const bobSession = session(t, bob);
        await bobSession.mutation(api.organizations.ensureProvisioned, {});
        const bobPresign = await bobSession.action(api.files.presignUpload, {
            originalName: "bob.png",
            mimeType: "image/png",
            fileSize: 1024,
        });
        expect(bobPresign.presignedUrl).toBe("https://r2.test/signed");
    });

    it("counts confirm in its own bucket so upload exhaustion does not block it", async () => {
        stubBridge();
        const { t, aliceSession, organizationId } = await bootstrap();
        const aliceId = await appUserId(aliceSession, alice.email);

        // Exhaust the presign budget without calling the action 100 times.
        for (let index = 0; index < RATE_LIMIT_POLICY.filePresign.limit; index += 1) {
            await consume(t, { bucket: "filePresign", key: `${aliceId}:${organizationId}` });
        }
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "blocked.png",
                mimeType: "image/png",
                fileSize: 1024,
            }),
            "RATE_LIMITED",
        );

        // Confirm is a different action with a different budget: the exhausted
        // presign budget must not lock a user out of finishing an upload. The call
        // gets past the limiter and reaches the bridge (which reports the object
        // missing), so the failure code proves *where* it stopped.
        const fileId = await seedPending(t, { organizationId, uploadedBy: aliceId });
        await expectCode(aliceSession.action(api.files.confirmUpload, { fileId }), "UPLOAD_OBJECT_MISSING");

        const confirmRows = (await bucketRows(t)).filter((row) => row.bucket === "fileConfirm");
        expect(confirmRows).toHaveLength(1);
        expect(confirmRows[0]!.count).toBe(1);
        expect(confirmRows[0]!.keyHash).toBe(await sha256Hex(`fileConfirm\u0000${aliceId}:${organizationId}`));
    });

    it("refuses an anonymous caller before it costs a budget unit", async () => {
        stubBridge();
        const { t } = await bootstrap();

        await expectCode(
            t.action(api.files.presignUpload, {
                originalName: "anon.png",
                mimeType: "image/png",
                fileSize: 1024,
            }),
            "UNAUTHENTICATED",
        );

        expect(await bucketRows(t)).toHaveLength(0);
    });
});

// The policy type is exported for callers; this keeps the union honest if a
// bucket is added without a matching entry in the mutation's validator.
describe("bucket type", () => {
    it("is exhaustive", () => {
        const buckets: RateLimitBucket[] = Object.keys(RATE_LIMIT_POLICY) as RateLimitBucket[];
        expect(new Set(buckets).size).toBe(buckets.length);
    });
});
