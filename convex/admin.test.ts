import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as adminModule from "./admin";
import { resolveEventLimits } from "./lib/domain";
import { eventFixture, initConvexTest } from "./test.setup";
import { getTemplatesByType } from "./lib/inviteTemplates";

/**
 * Admin console (plan Task 15).
 *
 * Authorization first: every public export of `convex/admin.ts` is exercised as
 * an anonymous caller, as a normal user and as a superAdmin, and a completeness
 * check fails the suite when a new export is added without being listed here.
 * The second half pins the rules that make the console safe to hand to an
 * operator: mandatory reason, audit on every write, no secret in any read.
 */

process.env.SITE_URL ??= "https://ceremly.test";

const MATRIMONIO_TEMPLATE = getTemplatesByType("matrimonio")[0]!.key;
process.env.CREEM_PRODUCT_ID_CELEBRATION ??= "prod_test_celebration";
process.env.CREEM_PRODUCT_ID_ATELIER ??= "prod_test_atelier";

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;

const ADMIN = { subject: "auth_admin", email: "Admin@Example.com", name: "Admin" };
const USER = { subject: "auth_user", email: "user@example.com", name: "User" };

const PAGE = { numItems: 20, cursor: null };

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown = undefined;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}, but the call resolved`).toBeDefined();
    const data = (caught as { data?: { code?: unknown } }).data;
    expect(data?.code, `expected ${code}, got ${JSON.stringify(data ?? String(caught))}`).toBe(code);
}

interface Fixture {
    t: Test;
    admin: Session;
    user: Session;
    adminId: Id<"appUsers">;
    userId: Id<"appUsers">;
    adminOrgId: Id<"organizations">;
    userOrgId: Id<"organizations">;
}

async function bootstrap(): Promise<Fixture> {
    const t = initConvexTest();
    register(t);

    const admin = t.withIdentity(ADMIN);
    const user = t.withIdentity(USER);
    const adminAccount = await admin.mutation(api.organizations.ensureProvisioned, {});
    const userAccount = await user.mutation(api.organizations.ensureProvisioned, {});

    await t.run(async (ctx) => ctx.db.patch(adminAccount.appUserId, { globalRole: "superAdmin" }));

    return {
        t,
        admin,
        user,
        adminId: adminAccount.appUserId,
        userId: userAccount.appUserId,
        adminOrgId: adminAccount.organizationId,
        userOrgId: userAccount.organizationId,
    };
}

const auditRows = (t: Test) => t.run(async (ctx) => ctx.db.query("auditLogs").collect());

async function seedDeadJob(t: Test): Promise<Id<"jobExecutions">> {
    return await t.run(async (ctx) =>
        ctx.db.insert("jobExecutions", {
            name: "send-invite-email",
            status: "dead",
            attempt: 5,
            maxAttempts: 5,
            lastError: "provider down",
            finishedAt: 1,
            dedupeKey: "invite:x",
            payload: { guestId: "g1", secretish: "PAYLOAD-SECRET-VALUE" },
            createdAt: 1,
            updatedAt: 1,
        }),
    );
}

/**
 * One call per public export, with arguments valid for the fixture. The keys are
 * the export names: the completeness test compares them with the module.
 */
function publicCalls(f: Fixture, jobId: Id<"jobExecutions">, eventId: Id<"events">) {
    return {
        whoami: (s: Session | Test) => s.query(api.admin.whoami, {}),
        overview: (s: Session | Test) => s.query(api.admin.overview, {}),
        eventMetrics: (s: Session | Test) => s.query(api.admin.eventMetrics, {}),
        billingMetrics: (s: Session | Test) => s.query(api.admin.billingMetrics, {}),
        searchUsers: (s: Session | Test) => s.query(api.admin.searchUsers, { paginationOpts: PAGE }),
        getUser: (s: Session | Test) => s.query(api.admin.getUser, { userId: f.userId }),
        searchOrganizations: (s: Session | Test) =>
            s.query(api.admin.searchOrganizations, { paginationOpts: PAGE }),
        getOrganization: (s: Session | Test) =>
            s.query(api.admin.getOrganization, { organizationId: f.userOrgId }),
        searchEvents: (s: Session | Test) => s.query(api.admin.searchEvents, { paginationOpts: PAGE }),
        getEvent: (s: Session | Test) => s.query(api.admin.getEvent, { eventId }),
        listJobs: (s: Session | Test) =>
            s.query(api.admin.listJobs, { status: "dead", paginationOpts: PAGE }),
        listExports: (s: Session | Test) =>
            s.query(api.admin.listExports, { status: "completed", paginationOpts: PAGE }),
        listAudit: (s: Session | Test) => s.query(api.admin.listAudit, { paginationOpts: PAGE }),
        setGlobalRole: (s: Session | Test) =>
            s.mutation(api.admin.setGlobalRole, { userId: f.userId, role: "superAdmin", reason: "test" }),
        setOrganizationLimits: (s: Session | Test) =>
            s.mutation(api.admin.setOrganizationLimits, {
                organizationId: f.userOrgId,
                limits: { maxGuestsPerEvent: 100, maxActiveEvents: null, maxReminders: null },
                reason: "test",
            }),
        retryJob: (s: Session | Test) => s.mutation(api.admin.retryJob, { jobId, reason: "test" }),
        setSiteMode: (s: Session | Test) =>
            s.mutation(api.admin.setSiteMode, { mode: "maintenance", reason: "test" }),
    } as const;
}

const WRITES = ["setGlobalRole", "setOrganizationLimits", "retryJob", "setSiteMode"] as const;

// ---------------------------------------------------------------------------
// Authorization matrix
// ---------------------------------------------------------------------------

describe("admin authorization: every export checks superAdmin first", () => {
    it("the matrix below covers every public export of convex/admin.ts", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);
        const eventId = await f.t.run(async (ctx) => ctx.db.insert("events", eventFixture(f.userOrgId)));

        const exported = Object.entries(adminModule)
            .filter(([, value]) => (value as { isPublic?: boolean }).isPublic === true)
            .map(([name]) => name)
            .sort();

        expect(exported).toEqual(Object.keys(publicCalls(f, jobId, eventId)).sort());
    });

    it("the bootstrap is internal: not reachable from a client", () => {
        const bootstrapFn = adminModule.bootstrapSuperAdmin as unknown as {
            isInternal?: boolean;
            isPublic?: boolean;
        };
        expect(bootstrapFn.isInternal).toBe(true);
        expect(bootstrapFn.isPublic).not.toBe(true);
    });

    it("anonymous callers are refused on every export", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);
        const eventId = await f.t.run(async (ctx) => ctx.db.insert("events", eventFixture(f.userOrgId)));

        for (const [name, call] of Object.entries(publicCalls(f, jobId, eventId))) {
            await expectCode(call(f.t), "UNAUTHENTICATED").catch((error) => {
                throw new Error(`${name}: ${String(error)}`);
            });
        }
    });

    it("a normal user is refused on every export, and a refused write changes nothing", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);
        const eventId = await f.t.run(async (ctx) => ctx.db.insert("events", eventFixture(f.userOrgId)));
        const auditBefore = (await auditRows(f.t)).length;

        for (const [name, call] of Object.entries(publicCalls(f, jobId, eventId))) {
            await expectCode(call(f.user), "SUPER_ADMIN_REQUIRED").catch((error) => {
                throw new Error(`${name}: ${String(error)}`);
            });
        }

        const state = await f.t.run(async (ctx) => ({
            user: await ctx.db.get(f.userId),
            job: await ctx.db.get(jobId),
            overrides: await ctx.db.query("organizationLimitOverrides").collect(),
            site: await ctx.db.query("siteSettings").collect(),
        }));
        expect(state.user!.globalRole).toBe("user");
        expect(state.job!.status).toBe("dead");
        expect(state.overrides).toHaveLength(0);
        expect(state.site).toHaveLength(0);
        expect((await auditRows(f.t)).length).toBe(auditBefore);
    });

    it("a user scheduled for deletion is refused even if superAdmin", async () => {
        const f = await bootstrap();
        await f.t.run(async (ctx) => ctx.db.patch(f.adminId, { deletionRequestedAt: 1, purgeAt: 2 }));
        await expectCode(f.admin.query(api.admin.whoami, {}), "ACCOUNT_SCHEDULED_FOR_DELETION");
    });

    it("a superAdmin passes every read", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);
        const eventId = await f.t.run(async (ctx) => ctx.db.insert("events", eventFixture(f.userOrgId)));
        const calls = publicCalls(f, jobId, eventId);

        for (const [name, call] of Object.entries(calls)) {
            if ((WRITES as readonly string[]).includes(name)) continue;
            await expect(call(f.admin), name).resolves.toBeDefined();
        }

        const me = await f.admin.query(api.admin.whoami, {});
        expect(me).toMatchObject({ appUserId: f.adminId, email: "admin@example.com" });
    });
});

// ---------------------------------------------------------------------------
// Bootstrap of the first superAdmin
// ---------------------------------------------------------------------------

describe("bootstrapSuperAdmin", () => {
    const previous = process.env.SUPER_ADMIN_EMAIL_ALLOWLIST;
    beforeEach(() => {
        process.env.SUPER_ADMIN_EMAIL_ALLOWLIST = " Ops@Example.com , user@EXAMPLE.com ";
    });
    afterEach(() => {
        if (previous === undefined) delete process.env.SUPER_ADMIN_EMAIL_ALLOWLIST;
        else process.env.SUPER_ADMIN_EMAIL_ALLOWLIST = previous;
    });

    async function withoutAdmins() {
        const t = initConvexTest();
        register(t);
        const user = t.withIdentity(USER);
        const account = await user.mutation(api.organizations.ensureProvisioned, {});
        return { t, user, userId: account.appUserId };
    }

    it("promotes an allowlisted email (normalized on both sides) and audits it", async () => {
        const { t, user, userId } = await withoutAdmins();

        const result = await t.mutation(internal.admin.bootstrapSuperAdmin, { email: "  USER@example.com " });
        expect(result).toMatchObject({ promoted: true, appUserId: userId });

        const row = await t.run(async (ctx) => ctx.db.get(userId));
        expect(row!.globalRole).toBe("superAdmin");

        const audit = (await auditRows(t)).find((entry) => entry.action === "admin.super_admin_bootstrapped");
        expect(audit).toMatchObject({
            category: "admin",
            targetType: "user",
            targetId: userId,
            status: "success",
        });
        expect(audit!.createdAt).toBeGreaterThan(0);
        expect(audit!.details).toMatchObject({ email: "user@example.com", source: "SUPER_ADMIN_EMAIL_ALLOWLIST" });

        // The promoted user can now open the console.
        await expect(user.query(api.admin.whoami, {})).resolves.toMatchObject({ appUserId: userId });
    });

    it("refuses an email that is not on the allowlist", async () => {
        const { t, userId } = await withoutAdmins();
        process.env.SUPER_ADMIN_EMAIL_ALLOWLIST = "ops@example.com";

        await expectCode(
            t.mutation(internal.admin.bootstrapSuperAdmin, { email: "user@example.com" }),
            "EMAIL_NOT_ALLOWLISTED",
        );
        expect((await t.run(async (ctx) => ctx.db.get(userId)))!.globalRole).toBe("user");
        expect(await auditRows(t)).toEqual(
            expect.not.arrayContaining([expect.objectContaining({ action: "admin.super_admin_bootstrapped" })]),
        );
    });

    it("refuses when the allowlist is missing or empty", async () => {
        const { t } = await withoutAdmins();
        process.env.SUPER_ADMIN_EMAIL_ALLOWLIST = " , ";
        await expectCode(
            t.mutation(internal.admin.bootstrapSuperAdmin, { email: "user@example.com" }),
            "SUPER_ADMIN_ALLOWLIST_EMPTY",
        );
        delete process.env.SUPER_ADMIN_EMAIL_ALLOWLIST;
        await expectCode(
            t.mutation(internal.admin.bootstrapSuperAdmin, { email: "user@example.com" }),
            "SUPER_ADMIN_ALLOWLIST_EMPTY",
        );
    });

    it("refuses an allowlisted email without a provisioned account", async () => {
        const { t } = await withoutAdmins();
        await expectCode(
            t.mutation(internal.admin.bootstrapSuperAdmin, { email: "ops@example.com" }),
            "APP_USER_NOT_FOUND",
        );
    });

    it("is only for the first superAdmin: afterwards roles change from the console", async () => {
        const { t } = await withoutAdmins();
        await t.mutation(internal.admin.bootstrapSuperAdmin, { email: "user@example.com" });

        const ops = t.withIdentity({ subject: "auth_ops", email: "ops@example.com", name: "Ops" });
        await ops.mutation(api.organizations.ensureProvisioned, {});

        await expectCode(
            t.mutation(internal.admin.bootstrapSuperAdmin, { email: "ops@example.com" }),
            "SUPER_ADMIN_ALREADY_EXISTS",
        );
    });
});

// ---------------------------------------------------------------------------
// Writes: reason, audit, guard rails
// ---------------------------------------------------------------------------

describe("admin writes require a reason and are audited", () => {
    it("rejects an empty or whitespace reason on every write, before any change", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);
        const auditBefore = (await auditRows(f.t)).length;

        for (const reason of ["", "   "]) {
            await expectCode(
                f.admin.mutation(api.admin.setGlobalRole, { userId: f.userId, role: "superAdmin", reason }),
                "REASON_REQUIRED",
            );
            await expectCode(
                f.admin.mutation(api.admin.setOrganizationLimits, {
                    organizationId: f.userOrgId,
                    limits: { maxGuestsPerEvent: 100, maxActiveEvents: null, maxReminders: null },
                    reason,
                }),
                "REASON_REQUIRED",
            );
            await expectCode(f.admin.mutation(api.admin.retryJob, { jobId, reason }), "REASON_REQUIRED");
            await expectCode(
                f.admin.mutation(api.admin.setSiteMode, { mode: "maintenance", reason }),
                "REASON_REQUIRED",
            );
        }

        await expectCode(
            f.admin.mutation(api.admin.retryJob, { jobId, reason: "x".repeat(501) }),
            "REASON_TOO_LONG",
        );

        expect((await auditRows(f.t)).length).toBe(auditBefore);
        expect((await f.t.run(async (ctx) => ctx.db.get(jobId)))!.status).toBe("dead");
    });

    it("setGlobalRole promotes and demotes with actor/target/timestamp/reason/details", async () => {
        const f = await bootstrap();

        const promoted = await f.admin.mutation(api.admin.setGlobalRole, {
            userId: f.userId,
            role: "superAdmin",
            reason: "  on-call rotation  ",
        });
        expect(promoted).toMatchObject({ changed: true, role: "superAdmin", previous: "user" });

        const entry = (await auditRows(f.t)).find((row) => row.action === "admin.role_changed");
        expect(entry).toMatchObject({
            category: "admin",
            actorAppUserId: f.adminId,
            actorAuthUserId: ADMIN.subject,
            targetType: "user",
            targetId: f.userId,
            status: "success",
        });
        expect(entry!.createdAt).toBeGreaterThan(0);
        expect(entry!.details).toMatchObject({ reason: "on-call rotation", from: "user", to: "superAdmin" });

        const noop = await f.admin.mutation(api.admin.setGlobalRole, {
            userId: f.userId,
            role: "superAdmin",
            reason: "again",
        });
        expect(noop).toMatchObject({ changed: false });
        expect((await auditRows(f.t)).filter((row) => row.action === "admin.role_changed")).toHaveLength(1);

        await f.admin.mutation(api.admin.setGlobalRole, { userId: f.userId, role: "user", reason: "rotation over" });
        expect((await f.t.run(async (ctx) => ctx.db.get(f.userId)))!.globalRole).toBe("user");
    });

    it("a superAdmin cannot demote themselves (the console always keeps an admin)", async () => {
        const f = await bootstrap();
        await expectCode(
            f.admin.mutation(api.admin.setGlobalRole, { userId: f.adminId, role: "user", reason: "oops" }),
            "CANNOT_CHANGE_OWN_ROLE",
        );
    });

    it("setOrganizationLimits writes an override, audits from/to, and the domain enforces it", async () => {
        const f = await bootstrap();
        const eventId = await f.t.run(async (ctx) => ctx.db.insert("events", eventFixture(f.userOrgId)));

        const before = await f.t.run(async (ctx) => resolveEventLimits(ctx, (await ctx.db.get(eventId))!));
        expect(before.maxGuestsPerEvent).toBe(30);

        await f.admin.mutation(api.admin.setOrganizationLimits, {
            organizationId: f.userOrgId,
            limits: { maxGuestsPerEvent: 120, maxActiveEvents: 3, maxReminders: null },
            reason: "wedding fair pilot",
        });

        const after = await f.t.run(async (ctx) => resolveEventLimits(ctx, (await ctx.db.get(eventId))!));
        expect(after).toMatchObject({ maxGuestsPerEvent: 120, maxActiveEvents: 3, maxReminders: 3 });

        const entry = (await auditRows(f.t)).find((row) => row.action === "admin.limits_updated");
        expect(entry).toMatchObject({
            actorAppUserId: f.adminId,
            organizationId: f.userOrgId,
            targetType: "organization",
            targetId: f.userOrgId,
        });
        expect(entry!.details).toMatchObject({
            reason: "wedding fair pilot",
            from: { maxGuestsPerEvent: null, maxActiveEvents: null, maxReminders: null },
            to: { maxGuestsPerEvent: 120, maxActiveEvents: 3, maxReminders: null },
        });

        // The active-event cap follows the override: a second free event is accepted.
        await f.user.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Primo" },
        });
        await f.user.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: MATRIMONIO_TEMPLATE, title: "Secondo" },
        });

        // Clearing every field returns to the plan limits (the row stays, reversible, audited).
        await f.admin.mutation(api.admin.setOrganizationLimits, {
            organizationId: f.userOrgId,
            limits: { maxGuestsPerEvent: null, maxActiveEvents: null, maxReminders: null },
            reason: "pilot ended",
        });
        const reset = await f.t.run(async (ctx) => resolveEventLimits(ctx, (await ctx.db.get(eventId))!));
        expect(reset.maxGuestsPerEvent).toBe(30);
        expect((await auditRows(f.t)).filter((row) => row.action === "admin.limits_updated")).toHaveLength(2);
    });

    it("setOrganizationLimits rejects values that are not -1 or a non-negative integer", async () => {
        const f = await bootstrap();
        for (const bad of [-2, 1.5, Number.NaN, 1_000_001]) {
            await expectCode(
                f.admin.mutation(api.admin.setOrganizationLimits, {
                    organizationId: f.userOrgId,
                    limits: { maxGuestsPerEvent: bad, maxActiveEvents: null, maxReminders: null },
                    reason: "bad value",
                }),
                "INVALID_LIMIT",
            );
        }
    });

    it("retryJob re-queues a dead job and audits the reason", async () => {
        const f = await bootstrap();
        const jobId = await seedDeadJob(f.t);

        const result = await f.admin.mutation(api.admin.retryJob, { jobId, reason: "provider recovered" });
        expect(result).toEqual({ retried: true });

        const job = await f.t.run(async (ctx) => ctx.db.get(jobId));
        expect(job).toMatchObject({ status: "pending", attempt: 0 });

        const entry = (await auditRows(f.t)).find((row) => row.action === "admin.job_retried");
        expect(entry).toMatchObject({ actorAppUserId: f.adminId, targetType: "job", targetId: jobId });
        expect(entry!.details).toMatchObject({
            reason: "provider recovered",
            name: "send-invite-email",
            previousAttempts: 5,
        });

        const again = await f.admin.mutation(api.admin.retryJob, { jobId, reason: "double click" });
        expect(again).toMatchObject({ retried: false, reason: "status_pending" });
        expect((await auditRows(f.t)).filter((row) => row.action === "admin.job_retried")).toHaveLength(1);
    });

    it("setSiteMode changes and clears the mode, with the reason in the audit", async () => {
        const f = await bootstrap();

        await f.admin.mutation(api.admin.setSiteMode, { mode: "maintenance-readonly", reason: "data fix" });
        expect(await f.t.query(api.siteSettings.getPublic, {})).toEqual({ mode: "maintenance-readonly" });

        await f.admin.mutation(api.admin.setSiteMode, { mode: null, reason: "done" });
        expect(await f.t.query(api.siteSettings.getPublic, {})).toEqual({ mode: "active" });

        const entries = (await auditRows(f.t)).filter((row) => row.action === "admin.site_mode_changed");
        expect(entries.map((row) => row.details)).toEqual([
            expect.objectContaining({ from: "active", to: "maintenance-readonly", reason: "data fix" }),
            expect.objectContaining({ from: "maintenance-readonly", to: "active", cleared: true, reason: "done" }),
        ]);
        expect(entries.every((row) => row.actorAppUserId === f.adminId)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Reads: indexed search, bounded pages, no secrets
// ---------------------------------------------------------------------------

describe("admin reads", () => {
    it("searches users by email prefix, organizations and events by slug prefix", async () => {
        const f = await bootstrap();
        const eventId = await f.t.run(async (ctx) =>
            ctx.db.insert("events", eventFixture(f.userOrgId, { slug: "nozze-rossi", title: "Nozze Rossi" })),
        );
        const org = await f.t.run(async (ctx) => ctx.db.get(f.userOrgId));

        const users = await f.admin.query(api.admin.searchUsers, { search: " USER@", paginationOpts: PAGE });
        expect(users.page.map((row) => row._id)).toEqual([f.userId]);

        const orgs = await f.admin.query(api.admin.searchOrganizations, {
            search: org!.slug.slice(0, 4),
            paginationOpts: PAGE,
        });
        expect(orgs.page.map((row) => row._id)).toContain(f.userOrgId);

        const events = await f.admin.query(api.admin.searchEvents, { search: "nozze", paginationOpts: PAGE });
        expect(events.page.map((row) => row._id)).toEqual([eventId]);

        const byOrg = await f.admin.query(api.admin.searchEvents, {
            organizationId: f.userOrgId,
            paginationOpts: PAGE,
        });
        expect(byOrg.page.map((row) => row._id)).toEqual([eventId]);
    });

    it("clamps the page size", async () => {
        const f = await bootstrap();
        await f.t.run(async (ctx) => {
            for (let index = 0; index < 105; index += 1) {
                await ctx.db.insert("auditLogs", {
                    action: "event.created",
                    category: "event",
                    status: "success",
                    createdAt: index,
                });
            }
        });
        const page = await f.admin.query(api.admin.listAudit, { paginationOpts: { numItems: 1000, cursor: null } });
        expect(page.page.length).toBe(100);
        expect(page.isDone).toBe(false);
    });

    it("computes the dashboard metrics", async () => {
        const f = await bootstrap();
        await f.t.run(async (ctx) => {
            const draft = await ctx.db.insert("events", eventFixture(f.userOrgId));
            await ctx.db.insert("events", eventFixture(f.userOrgId, { tier: "celebration", status: "active", unlockedAt: 5 }));
            const guestId = await ctx.db.insert("guests", {
                organizationId: f.userOrgId,
                eventId: draft,
                firstName: "A",
                lastName: "B",
                token: "GUESTTOKEN1",
                openCount: 0,
                remindersDisabled: false,
                createdAt: 1,
                updatedAt: 1,
            });
            await ctx.db.insert("rsvpResponses", {
                organizationId: f.userOrgId,
                eventId: draft,
                guestId,
                attending: "yes",
                companionsCount: 1,
                answers: {},
                submittedAt: 1,
                updatedAt: 1,
            });
        });
        await seedDeadJob(f.t);

        const overview = await f.admin.query(api.admin.overview, {});
        expect(overview.users).toMatchObject({ total: 2, superAdmins: 1, capped: false });
        expect(overview.organizations).toMatchObject({ total: 2, capped: false });
        expect(overview.jobs.dead).toBe(1);
        expect(overview.siteMode).toBe("active");

        const events = await f.admin.query(api.admin.eventMetrics, {});
        expect(events.events).toMatchObject({ total: 2, capped: false, celebration: 1, unlocked: 1 });
        expect(events.events.byStatus).toMatchObject({ draft: 1, active: 1, closed: 0 });
        expect(events.conversionRate).toBeCloseTo(0.5);
        expect(events.rsvp).toMatchObject({ total: 1, yes: 1, no: 0, maybe: 0, capped: false });

        const billing = await f.admin.query(api.admin.billingMetrics, {});
        expect(billing).toMatchObject({ organizationsScanned: 2, atelierActive: 0, capped: false });
    });

    it("returns no secret, hash, token or job payload", async () => {
        const f = await bootstrap();
        const eventId = await f.t.run(async (ctx) => {
            await ctx.db.insert("invitations", {
                organizationId: f.userOrgId,
                email: "guest@example.com",
                role: "member",
                status: "pending",
                tokenHash: "INVITE-TOKEN-HASH",
                inviterUserId: f.userId,
                expiresAt: Date.now() + 1000,
                createdAt: 1,
            });
            await ctx.db.insert("dataExports", {
                userId: f.userId,
                status: "completed",
                format: "json",
                downloadUrl: "https://r2.example/SIGNED-URL",
                storageKey: "exports/STORAGE-KEY",
                downloadToken: "EXPORT-DOWNLOAD-TOKEN",
                createdAt: 1,
            });
            await ctx.db.insert("auditLogs", {
                action: "user.profile_updated",
                category: "user",
                status: "success",
                targetId: f.userId,
                details: { token: "AUDIT-TOKEN", nested: { passwordHash: "AUDIT-HASH", ok: "visible" } },
                createdAt: 2,
            });
            const id = await ctx.db.insert("events", eventFixture(f.userOrgId, { creemCheckoutId: "chk_1" }));
            await ctx.db.insert("guests", {
                organizationId: f.userOrgId,
                eventId: id,
                firstName: "A",
                lastName: "B",
                token: "GUEST-TOKEN",
                openCount: 0,
                remindersDisabled: false,
                createdAt: 1,
                updatedAt: 1,
            });
            return id;
        });
        const jobId = await seedDeadJob(f.t);

        const outputs = await Promise.all(
            Object.entries(publicCalls(f, jobId, eventId))
                .filter(([name]) => !(WRITES as readonly string[]).includes(name))
                .map(async ([, call]) => JSON.stringify(await call(f.admin))),
        );
        const exportsPage = await f.admin.query(api.admin.listExports, { status: "completed", paginationOpts: PAGE });
        expect(exportsPage.page).toHaveLength(1);
        const auditPage = await f.admin.query(api.admin.listAudit, { paginationOpts: PAGE });
        const redacted = auditPage.page.find((row) => row.action === "user.profile_updated");
        expect(redacted!.details).toEqual({ token: "[redacted]", nested: { passwordHash: "[redacted]", ok: "visible" } });

        const all = outputs.join("\n") + JSON.stringify(exportsPage) + JSON.stringify(auditPage);
        for (const secret of [
            "INVITE-TOKEN-HASH",
            "SIGNED-URL",
            "STORAGE-KEY",
            "EXPORT-DOWNLOAD-TOKEN",
            "AUDIT-TOKEN",
            "AUDIT-HASH",
            "GUEST-TOKEN",
            "PAYLOAD-SECRET-VALUE",
        ]) {
            expect(all, `leaked ${secret}`).not.toContain(secret);
        }
        expect(all).toContain("visible");
    });

    it("organization detail shows the subscription read-only and the limit override", async () => {
        const f = await bootstrap();
        await f.t.run(async (ctx) => {
            await ctx.runMutation(components.creem.lib.insertCustomer, {
                id: "cust_1",
                entityId: f.userOrgId,
                email: "user@example.com",
            });
            await ctx.runMutation(components.creem.lib.createSubscription, {
                subscription: {
                    id: "sub_1",
                    customerId: "cust_1",
                    productId: process.env.CREEM_PRODUCT_ID_ATELIER!,
                    status: "active",
                    amount: 2400,
                    currency: "EUR",
                    recurringInterval: "every-month",
                    currentPeriodStart: new Date().toISOString(),
                    currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
                    cancelAtPeriodEnd: false,
                    startedAt: new Date().toISOString(),
                    endedAt: null,
                    checkoutId: null,
                    metadata: { internal: "METADATA-NOT-SHOWN" },
                    createdAt: new Date().toISOString(),
                    modifiedAt: null,
                },
            });
        });
        await f.admin.mutation(api.admin.setOrganizationLimits, {
            organizationId: f.userOrgId,
            limits: { maxGuestsPerEvent: 400, maxActiveEvents: null, maxReminders: null },
            reason: "enterprise trial",
        });

        const detail = await f.admin.query(api.admin.getOrganization, { organizationId: f.userOrgId });
        expect(detail.plan).toBe("atelier");
        expect(detail.subscriptions).toEqual([
            expect.objectContaining({ id: "sub_1", status: "active", productId: "prod_test_atelier" }),
        ]);
        expect(detail.limitOverride).toMatchObject({ maxGuestsPerEvent: 400, reason: "enterprise trial" });
        expect(detail.members.map((member) => member.email)).toEqual(["user@example.com"]);
        expect(JSON.stringify(detail)).not.toContain("METADATA-NOT-SHOWN");

        const billing = await f.admin.query(api.admin.billingMetrics, {});
        expect(billing.atelierActive).toBe(1);
    });
});
