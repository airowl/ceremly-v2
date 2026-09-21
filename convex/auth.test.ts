import { describe, expect, it, vi } from "vitest";
import { initConvexTest, initConvexTestWithAuthComponent } from "./test.setup";
import { createAuth } from "./auth";
import { components } from "./_generated/api";
import { DEFAULT_LOCALE } from "./organizations";

type Test = ReturnType<typeof initConvexTest>;

/**
 * The Better Auth -> application provisioning trigger (plan Task 5, Step 4).
 *
 * Two properties matter and both are invisible in the isolation suite:
 *
 * 1. a `user.create` hook actually schedules `internal.organizations.provisionAuthUser`;
 * 2. the hook can never turn a successful sign-up into a 500 — Better Auth runs
 *    `after` hooks on the request path, after the user row is committed.
 *
 * The hook is exercised through the real `createAuth`, against a real action
 * context and the real scheduler, so a wiring mistake (wrong function
 * reference, guard inverted, ctx not reaching the scheduler) fails here.
 */

// `createAuth` reads its deployment configuration from `process.env`
// (`convex/lib/env.ts`); the values are irrelevant to this test and are only
// present to let the auth object be constructed outside a deployment.
process.env.SITE_URL ??= "https://staging.example";
process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-anything";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-secret";

type AfterHook = (user: { id: string; email: string; name?: string | null }) => Promise<void> | void;

const getCreateHook = (auth: ReturnType<typeof createAuth>): AfterHook => {
    const hook = (
        auth.options as {
            databaseHooks?: { user?: { create?: { after?: AfterHook } } };
        }
    ).databaseHooks?.user?.create?.after;

    if (!hook) {
        throw new Error("createAuth no longer exposes a user.create after hook");
    }

    return hook;
};

/**
 * Fires the hook on a real action context and drains what it scheduled.
 *
 * `runAfter(0)` only materializes under convex-test's fake timers: the scheduler
 * of an action invocation is drained by `finishAllScheduledFunctions`, which
 * needs mocked timers to advance.
 */
async function runCreateTrigger(t: Test, user: { id: string; email: string; name?: string }) {
    vi.useFakeTimers();
    try {
        await t.action(async (ctx) => {
            await getCreateHook(createAuth(ctx))(user);
        });
        await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
        vi.useRealTimers();
    }
}

/**
 * One sign-in attempt through the real Better Auth handler, as the Worker proxy
 * would deliver it. The IP is pinned with `x-forwarded-for` so the counter key is
 * deterministic (Better Auth's default storage is memory, whose counters are
 * invisible to a test).
 */
async function attemptSignIn(t: Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>, ip = "203.0.113.9") {
    return await t.action(async (ctx) => {
        const auth = createAuth(ctx);
        const response = await auth.handler(
            new Request("https://staging.example/api/auth/sign-in/email", {
                method: "POST",
                headers: { "content-type": "application/json", "x-forwarded-for": ip },
                body: JSON.stringify({ email: "rate-limit-gate@example.com", password: "not-the-password" }),
            }),
        );

        return { status: response.status, retryAfter: response.headers.get("x-retry-after") };
    });
}

/**
 * G09 — the brute-force limiter on the auth surface (plan Task 8).
 *
 * The legacy server had explicit rules (sign-in 10/min, reset 5/min) on top of
 * Upstash; without a ported config the Convex deployment would fall back to
 * `memory` storage, which on serverless is per-isolate. This asserts both halves:
 * the rules are the legacy ones, and the counters land in the component's database.
 */
describe("Better Auth rate limiting", () => {
    it("keeps the legacy thresholds and stores counters in the database", async () => {
        const t = initConvexTest();

        const options = await t.action(async (ctx) => createAuth(ctx).options.rateLimit);

        expect(options).toMatchObject({
            enabled: true,
            storage: "database",
            window: 60,
            max: 100,
            customRules: {
                "/sign-in/email": { window: 60, max: 10 },
                "/request-password-reset": { window: 60, max: 5 },
                "/reset-password": { window: 60, max: 10 },
            },
        });
    });

    it("refuses the eleventh sign-in attempt in the same window", async () => {
        const t = await initConvexTestWithAuthComponent();

        for (let attempt = 1; attempt <= 10; attempt += 1) {
            const response = await attemptSignIn(t);
            expect(response.status, `attempt ${attempt} must not be limited`).not.toBe(429);
        }

        const limited = await attemptSignIn(t);
        expect(limited.status).toBe(429);
        expect(Number(limited.retryAfter)).toBeGreaterThan(0);

        // The counters are rows in the component's `rateLimit` table, not an
        // in-process map: that is what makes the limit survive a cold start and
        // hold across isolates.
        const counters = await t.action(async (ctx) =>
            await ctx.runQuery(components.betterAuth.adapter.findMany, {
                model: "rateLimit",
                where: [],
                paginationOpts: { numItems: 50, cursor: null },
            }),
        );
        expect(counters.page).not.toHaveLength(0);
        expect(Math.max(...counters.page.map((row: { count: number }) => Number(row.count)))).toBeGreaterThanOrEqual(10);
    });

    it("limits each address on its own counter", async () => {
        const t = await initConvexTestWithAuthComponent();

        for (let attempt = 1; attempt <= 10; attempt += 1) {
            await attemptSignIn(t, "198.51.100.4");
        }
        expect((await attemptSignIn(t, "198.51.100.4")).status).toBe(429);

        // A different source address is not collateral damage. (Its attempts fail
        // on credentials, which is the point: no 429.)
        expect((await attemptSignIn(t, "198.51.100.5")).status).not.toBe(429);
    });
});

describe("Better Auth provisioning trigger", () => {
    it("provisions the app user, workspace and owner membership on user.create", async () => {
        const t = initConvexTest();

        await runCreateTrigger(t, {
            id: "auth_new_user",
            email: "New.User@Example.com",
            name: "New User",
        });

        const appUser = await t.run(async (c) =>
            c.db
                .query("appUsers")
                .withIndex("by_auth_user", (q) => q.eq("authUserId", "auth_new_user"))
                .unique(),
        );

        expect(appUser).not.toBeNull();
        expect(appUser?.email).toBe("new.user@example.com");
        expect(appUser?.locale).toBe(DEFAULT_LOCALE);
        expect(appUser?.globalRole).toBe("user");

        const memberships = await t.run(async (c) =>
            c.db
                .query("memberships")
                .withIndex("by_user", (q) => q.eq("userId", appUser!._id))
                .collect(),
        );
        expect(memberships).toHaveLength(1);
        expect(memberships[0]?.role).toBe("owner");
        expect(appUser?.activeOrganizationId).toBe(memberships[0]?.organizationId);

        const organization = await t.run(async (c) => c.db.get(memberships[0]!.organizationId));
        expect(organization?.name).toBe("New User's Workspace");

        const audit = await t.run(async (c) => c.db.query("auditLogs").collect());
        expect(audit.map((row) => row.action).sort()).toEqual([
            "organization.created",
            "organization.member_provisioned",
        ]);
        expect(audit.every((row) => row.actorAuthUserId === "auth_new_user")).toBe(true);
    });

    it("is idempotent when the trigger fires more than once", async () => {
        const t = initConvexTest();

        for (const attempt of [0, 1]) {
            await runCreateTrigger(t, {
                id: "auth_repeat",
                email: "repeat@example.com",
                name: `Repeat ${attempt}`,
            });
        }

        const appUsers = await t.run(async (c) =>
            c.db.query("appUsers").withIndex("by_email", (q) => q.eq("email", "repeat@example.com")).collect(),
        );
        expect(appUsers).toHaveLength(1);

        const memberships = await t.run(async (c) =>
            c.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", appUsers[0]!._id)).collect(),
        );
        expect(memberships).toHaveLength(1);
    });

    it("never fails a sign-up when scheduling is unavailable", async () => {
        const calls: unknown[] = [];
        const brokenCtx = {
            scheduler: {
                runAfter: () => {
                    calls.push("called");
                    throw new Error("scheduler is not available");
                },
            },
        };

        const auth = createAuth(brokenCtx as never);

        await expect(
            getCreateHook(auth)({ id: "auth_broken", email: "broken@example.com" }),
        ).resolves.toBeUndefined();
        expect(calls).toHaveLength(1);
    });

    it("does not schedule from a read-only context", async () => {
        const scheduled: unknown[] = [];
        // A query context owns `db`, which is exactly what the guard checks.
        const queryLikeCtx = {
            db: {},
            scheduler: {
                runAfter: () => {
                    scheduled.push("called");
                },
            },
        };

        const auth = createAuth(queryLikeCtx as never);
        await getCreateHook(auth)({ id: "auth_query", email: "query@example.com" });

        expect(scheduled).toHaveLength(0);
    });
});
