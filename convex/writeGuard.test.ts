import { register } from "@creem_io/convex/test";
import { describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { WRITE_GUARD_TAG } from "./lib/functions";
import { getTemplatesByType } from "./lib/inviteTemplates";
import { SITE_READ_ONLY, authEndpointAllowed, writesAllowed } from "./lib/writeGuard";
import { initConvexTest, initConvexTestWithAuthComponent } from "./test.setup";

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

// ---------------------------------------------------------------------------
// Fix round 2 (N4): Better Auth write endpoints on the `.convex.site` host.
// ---------------------------------------------------------------------------

describe("write guard: Better Auth endpoints through the real handler", () => {
    process.env.SITE_URL ??= "https://staging.example";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-anything";
    process.env.GOOGLE_CLIENT_ID ??= "test-google-client";
    process.env.GOOGLE_CLIENT_SECRET ??= "test-google-secret";

    const call = async (
        t: Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>,
        method: "GET" | "POST",
        path: string,
        body?: unknown,
    ): Promise<number> =>
        await t.action(async (ctx) => {
            const { createAuth } = await import("./auth");
            const response = await createAuth(ctx).handler(
                new Request(`https://staging.example/api/auth${path}`, {
                    method,
                    headers: { "content-type": "application/json", origin: "https://staging.example", "x-forwarded-for": "203.0.113.7" },
                    body: body === undefined ? undefined : JSON.stringify(body),
                }),
            );
            return response.status;
        });

    const creds = { email: "guard@example.com", password: "correct-horse-battery-staple", name: "Guard" };

    it("active: sign-up works; read-only: sign-up and every account write are refused (503), login and reads pass", async () => {
        const t = await initConvexTestWithAuthComponent();
        vi.useFakeTimers();
        try {
            expect(await call(t, "POST", "/sign-up/email", creds)).toBe(200);
        } finally {
            vi.useRealTimers();
        }

        // `requireEmailVerification`: mark the address verified, as an imported user is.
        await t.run(async (ctx) =>
            ctx.runMutation(components.betterAuth.adapter.updateOne, {
                input: { model: "user", where: [{ field: "email", value: creds.email }], update: { emailVerified: true } },
            } as never),
        );
        await t.mutation(internal.siteSettings.set, { mode: "maintenance-readonly", reason: "test" });

        expect(await call(t, "POST", "/sign-up/email", { ...creds, email: "second@example.com" })).toBe(503);
        // Without the guard these would be 401 (no session); the guard answers first.
        for (const path of ["/update-user", "/change-password", "/change-email", "/delete-user", "/two-factor/enable", "/two-factor/disable", "/reset-password", "/request-password-reset", "/two-factor/verify-backup-code", "/sign-in/social"]) {
            expect(await call(t, "POST", path, {}), path).toBe(503);
        }
        expect(await call(t, "GET", "/verify-email?token=x")).toBe(503);

        // Allowed: password login, session read, logout.
        expect(await call(t, "POST", "/sign-in/email", { email: creds.email, password: creds.password })).toBe(200);
        expect(await call(t, "GET", "/get-session")).toBe(200);
        expect(await call(t, "POST", "/sign-out", {})).not.toBe(503);

        const users = await t.run(async (ctx) =>
            ctx.runQuery(components.betterAuth.adapter.findMany, {
                model: "user",
                paginationOpts: { numItems: 10, cursor: null },
            } as never),
        );
        expect((users as { page: unknown[] }).page).toHaveLength(1);
    });

    it("the endpoint matrix is the documented one", () => {
        expect(authEndpointAllowed("active", "POST", "/update-user")).toBe(true);
        for (const mode of ["waitinglist", "maintenance", "maintenance-readonly"] as const) {
            expect(authEndpointAllowed(mode, "POST", "/sign-in/email")).toBe(true);
            expect(authEndpointAllowed(mode, "POST", "/two-factor/verify-totp")).toBe(true);
            expect(authEndpointAllowed(mode, "POST", "/sign-out")).toBe(true);
            expect(authEndpointAllowed(mode, "GET", "/get-session")).toBe(true);
            expect(authEndpointAllowed(mode, "GET", "/convex/token")).toBe(true);
            expect(authEndpointAllowed(mode, "POST", "/sign-up/email")).toBe(false);
            expect(authEndpointAllowed(mode, "GET", "/callback/google")).toBe(false);
            expect(authEndpointAllowed(mode, "PATCH", "/anything")).toBe(false);
            // Final review I2: never a credential change, never OAuth.
            expect(authEndpointAllowed(mode, "POST", "/two-factor/enable")).toBe(false);
            expect(authEndpointAllowed(mode, "POST", "/two-factor/disable")).toBe(false);
            expect(authEndpointAllowed(mode, "POST", "/sign-in/social")).toBe(false);
        }
    });

    it("final review I2: backup code is allowed exactly where the Worker allows it", async () => {
        const { isAdminBreakGlassAuthApi, readonlyVerdict } = await import("../shared/constants/siteMode");
        const probes = [
            "/sign-in/email",
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
            "/two-factor/enable",
            "/two-factor/disable",
            "/sign-out",
            "/sign-up/email",
            "/sign-in/social",
        ];
        for (const path of probes) {
            // Worker: break-glass in maintenance/waitinglist, the read-only allowlist in read-only.
            const workerBreakGlass = isAdminBreakGlassAuthApi(`/api/auth${path}`, "POST");
            const workerReadonly = readonlyVerdict(`/api/auth${path}`, "POST") === "allow";
            expect(authEndpointAllowed("maintenance", "POST", path), path).toBe(workerBreakGlass);
            expect(authEndpointAllowed("waitinglist", "POST", path), path).toBe(workerBreakGlass);
            expect(authEndpointAllowed("maintenance-readonly", "POST", path), path).toBe(workerReadonly);
        }
        expect(authEndpointAllowed("maintenance", "POST", "/two-factor/verify-backup-code")).toBe(true);
        expect(authEndpointAllowed("maintenance-readonly", "POST", "/two-factor/verify-backup-code")).toBe(false);
    });
});
