import { describe, expect, it, vi } from "vitest";
import { initConvexTest } from "./test.setup";
import { createAuth } from "./auth";
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
