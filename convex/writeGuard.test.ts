import { register } from "@creem_io/convex/test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { WRITE_GUARD_TAG } from "./lib/functions";
import { getTemplatesByType } from "./lib/inviteTemplates";
import { SITE_READ_ONLY, writesAllowed } from "./lib/writeGuard";
import { initConvexTest } from "./test.setup";

/**
 * Migration Task 17, fix round 1 — site-mode guard on Convex writes.
 *
 * On the new stack the browser calls public mutations directly, so the Worker's
 * read-only gate cannot stop them. The guard lives in the builders
 * (`convex/lib/functions.ts`); this suite proves (1) no public mutation/action
 * escapes the builders — by enumeration, not by a hand list — and (2) the modes
 * do what `lib/writeGuard.ts` says they do.
 */


const ADMIN = { subject: "auth_admin", email: "admin@example.com", name: "Admin" };
const USER = { subject: "auth_user", email: "user@example.com", name: "User" };
const NEWCOMER = { subject: "auth_new", email: "new@example.com", name: "New" };

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected ${code}, the call resolved`).toBeDefined();
    expect((caught as { data?: { code?: unknown } }).data?.code, String(caught)).toBe(code);
}

async function notCode(promise: Promise<unknown>, code: string): Promise<void> {
    try {
        await promise;
    } catch (error) {
        expect((error as { data?: { code?: unknown } }).data?.code).not.toBe(code);
    }
}

async function bootstrap() {
    const t = initConvexTest();
    register(t);
    const admin = t.withIdentity(ADMIN);
    const user = t.withIdentity(USER);
    const adminAccount = await admin.mutation(api.organizations.ensureProvisioned, {});
    await user.mutation(api.organizations.ensureProvisioned, {});
    await t.run(async (ctx) => ctx.db.patch(adminAccount.appUserId, { globalRole: "superAdmin" }));
    const setMode = (mode: "active" | "waitinglist" | "maintenance" | "maintenance-readonly") =>
        t.mutation(internal.siteSettings.set, { mode, reason: "test" });
    return { t, admin, user, setMode };
}

// ---------------------------------------------------------------------------
// Enumeration: every public write is built by the guarded builders.
// ---------------------------------------------------------------------------

const sources = import.meta.glob<Record<string, unknown>>(["./**/*.ts", "!./**/*.test.ts", "!./_generated/**", "!./test.setup.ts", "!./convex.config.ts"], {
    eager: true,
});

describe("write guard: enumeration of public Convex writes", () => {
    const publicWrites: { name: string; tag: unknown }[] = [];
    for (const [file, mod] of Object.entries(sources)) {
        for (const [exportName, value] of Object.entries(mod)) {
            const fn = value as { isPublic?: boolean; isMutation?: boolean; isAction?: boolean } | null;
            if (!fn || (typeof fn !== "function" && typeof fn !== "object")) continue;
            if (fn.isPublic && (fn.isMutation || fn.isAction)) {
                publicWrites.push({
                    name: `${file.replace(/^\.\//, "").replace(/\.ts$/, "")}:${exportName}`,
                    tag: (fn as Record<string, unknown>)[WRITE_GUARD_TAG],
                });
            }
        }
    }

    it("finds the public mutations and actions (not vacuous)", () => {
        expect(publicWrites.length).toBeGreaterThanOrEqual(40);
    });

    it("every public mutation/action carries a guard tag", () => {
        const untagged = publicWrites.filter((w) => w.tag === undefined).map((w) => w.name);
        expect(untagged).toEqual([]);
    });

    it("the non-default tags are exactly the reviewed ones", () => {
        const special = publicWrites
            .filter((w) => w.tag !== "domain")
            .map((w) => `${w.name}=${String(w.tag)}`)
            .sort();
        expect(special).toEqual([
            "admin:setSiteMode=siteModeSwitch",
            "dataExports:downloadUrl=read",
            "files:downloadUrl=read",
            "organizations:ensureProvisioned=inline",
            "rsvp:publicInvite=inline",
            "rsvp:submit=guest",
            "rsvp:trackEmailOpen=inline",
        ]);
    });
});

// ---------------------------------------------------------------------------
// Behaviour per mode.
// ---------------------------------------------------------------------------

describe("write guard: the mode matrix", () => {
    it("is the documented table", () => {
        expect(writesAllowed("active", "domain")).toBe(true);
        expect(writesAllowed("waitinglist", "domain")).toBe(false);
        expect(writesAllowed("waitinglist", "guest")).toBe(true);
        expect(writesAllowed("maintenance-readonly", "guest")).toBe(false);
        expect(writesAllowed("maintenance", "guest")).toBe(false);
        for (const mode of ["active", "waitinglist", "maintenance", "maintenance-readonly"] as const) {
            expect(writesAllowed(mode, "siteModeSwitch")).toBe(true);
        }
    });

    it("maintenance-readonly refuses a domain mutation, active accepts it again", async () => {
        const { user, setMode } = await bootstrap();
        await setMode("maintenance-readonly");
        await expectCode(user.mutation(api.projects.create, { input: { name: "x" } }), SITE_READ_ONLY);
        await setMode("maintenance");
        await expectCode(user.mutation(api.projects.create, { input: { name: "x" } }), SITE_READ_ONLY);
        await setMode("waitinglist");
        await expectCode(user.mutation(api.projects.create, { input: { name: "x" } }), SITE_READ_ONLY);
        await setMode("active");
        await expect(user.mutation(api.projects.create, { input: { name: "x" } })).resolves.toBeDefined();
    });

    it("refuses a domain action before it does anything", async () => {
        const { user, setMode } = await bootstrap();
        await setMode("maintenance-readonly");
        await expectCode(user.action(api.billing.checkoutsCreate, { tier: "atelier" }), SITE_READ_ONLY);
    });

    it("RSVP: refused in both maintenance modes, reaches the handler in waitinglist and active", async () => {
        const { t, setMode } = await bootstrap();
        const args = { token: "no-such-token", attending: "yes" as const, companionsCount: 0, answers: {} };
        await setMode("maintenance-readonly");
        await expectCode(t.mutation(api.rsvp.submit, args), SITE_READ_ONLY);
        await setMode("maintenance");
        await expectCode(t.mutation(api.rsvp.submit, args), SITE_READ_ONLY);
        await setMode("waitinglist");
        await notCode(t.mutation(api.rsvp.submit, args), SITE_READ_ONLY);
        await setMode("active");
        await notCode(t.mutation(api.rsvp.submit, args), SITE_READ_ONLY);
    });

    it("the superAdmin site-mode switch works in every mode (break-glass); a user still cannot", async () => {
        const { admin, user, setMode } = await bootstrap();
        for (const mode of ["maintenance-readonly", "maintenance", "waitinglist"] as const) {
            await setMode(mode);
            await expect(admin.mutation(api.admin.setSiteMode, { mode: "active", reason: "break-glass" })).resolves.toBeDefined();
            await setMode(mode);
            await expectCode(user.mutation(api.admin.setSiteMode, { mode: "active", reason: "x" }), "SUPER_ADMIN_REQUIRED");
        }
    });

    it("ensureProvisioned: an existing account logs in without a write; a new one is refused", async () => {
        const { t, user, setMode } = await bootstrap();
        await setMode("maintenance-readonly");
        const before = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).length);
        const result = await user.mutation(api.organizations.ensureProvisioned, {});
        expect(result.provisioned).toBe(false);
        expect(result.appUserId).toBeDefined();
        const after = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).length);
        expect(after).toBe(before);
        await expectCode(t.withIdentity(NEWCOMER).mutation(api.organizations.ensureProvisioned, {}), SITE_READ_ONLY);
    });

    it("publicInvite serves the invitation without tracking outside active; trackEmailOpen is a no-op", async () => {
        const { t, user, setMode } = await bootstrap();
        const event = await user.mutation(api.events.create, {
            input: { type: "matrimonio", templateKey: getTemplatesByType("matrimonio")[0]!.key, title: "G & T" },
        });
        const guest = await user.mutation(api.guests.create, {
            eventId: event._id,
            input: { firstName: "Ada", lastName: "L", email: "ada@example.com" },
        });
        await user.mutation(api.events.update, { eventId: event._id, input: { status: "active" } });
        const token = guest!.token;

        await setMode("maintenance-readonly");
        const invite = await t.mutation(api.rsvp.publicInvite, { token });
        expect(invite.guest.firstName).toBe("Ada");
        expect(await t.mutation(api.rsvp.trackEmailOpen, { token })).toEqual({ tracked: false });
        const row = await t.run(async (ctx) => ctx.db.get(guest!._id as Id<"guests">));
        expect(row!.openCount).toBe(0);
        expect(row!.emailOpenedAt).toBeUndefined();
        const activities = await t.run(async (ctx) => ctx.db.query("guestActivities").collect());
        expect(activities.filter((a) => a.type === "link_opened" || a.type === "email_opened")).toEqual([]);

        await setMode("active");
        await t.mutation(api.rsvp.publicInvite, { token });
        const tracked = await t.run(async (ctx) => ctx.db.get(guest!._id as Id<"guests">));
        expect(tracked!.openCount).toBe(1);
    });
});

describe("write guard: doors that are not public builders", () => {
    it("sign-up on the Convex site host follows the domain policy", async () => {
        const { signUpAllowed } = await import("./auth");
        expect(signUpAllowed("active")).toBe(true);
        for (const mode of ["waitinglist", "maintenance", "maintenance-readonly"] as const) {
            expect(signUpAllowed(mode)).toBe(false);
        }
    });

    it("the public-form HTTP routes declare a policy and check it", async () => {
        const { readFileSync } = await import("node:fs");
        const source = readFileSync("convex/http.ts", "utf8");
        expect(source).toMatch(/\/public\/contact".*policy: "domain"/);
        expect(source).toMatch(/\/public\/waiting-list".*policy: "guest"/);
        expect(source).toMatch(/writesAllowed\(mode, route\.policy\)/);
    });
});
