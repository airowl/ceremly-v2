import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runtimeConfig } from "../../server/utils/runtimeConfig";
import { setServerSiteMode, shouldTrackReads } from "../../server/utils/siteMode";
import {
    READONLY_ALLOWED_WRITES,
    READONLY_RETRY_AFTER_SECONDS,
    READONLY_SIDE_EFFECT_READS,
    isAuthCatchAllOpen,
    readonlyVerdict,
} from "../../shared/constants/siteMode";

/**
 * Task 17, Step 1 — `maintenance-readonly` as the cutover mode.
 *
 * The window between "Vercel stops writing" and "Convex starts writing" is the
 * one in which a lost write is lost for good: it happens after the watermark,
 * so the delta export never sees it. The mode therefore has to be *closed by
 * default* on writes, and the proof cannot be a hand-written list of routes
 * (that list is exactly what drifts). Three layers:
 *
 * 1. the explicit cases the plan names — RSVP, checkout, upload, account
 *    mutations — through the real middleware, with `503` + `Retry-After`;
 * 2. every write route **on disk** (`server/api/**` by method suffix) is refused
 *    unless it is in the explicit allowlist, so a route added tomorrow is
 *    closed without anyone touching this file;
 * 3. every GET route on disk must be classified here (pure / side effect), so a
 *    new GET that writes cannot slip through the method-based rule unnoticed.
 */

type FakeEvent = {
    path: string;
    method: string;
    headers: Record<string, string>;
};

const g = globalThis as Record<string, unknown>;
g.defineEventHandler = (handler: unknown) => handler;
g.sendRedirect = (_event: FakeEvent, location: string, status: number) => ({ redirect: location, status });
g.setResponseHeader = (event: FakeEvent, name: string, value: string | number) => {
    event.headers[name.toLowerCase()] = String(value);
};
g.useRuntimeConfig = () => ({ public: { siteMode: "active" } });

type Middleware = (event: FakeEvent) => unknown;
let middleware: Middleware;

beforeAll(async () => {
    // In-memory cache client: hermetic, no Upstash round trip.
    const config = runtimeConfig as unknown as Record<string, unknown>;
    config.upstashRedisRestUrl = undefined;
    config.upstashRedisRestToken = undefined;
    runtimeConfig.siteModeBackend = "legacy";
    middleware = (await import("../../server/middleware/0.site-mode")).default as unknown as Middleware;
    await setServerSiteMode("maintenance-readonly");
});

async function call(path: string, method = "GET") {
    const event: FakeEvent = { path, method, headers: {} };
    try {
        const result = (await middleware(event)) as { redirect?: string } | undefined;
        return { result, statusCode: undefined as number | undefined, headers: event.headers };
    } catch (error) {
        return { result: undefined, statusCode: (error as { statusCode?: number }).statusCode, headers: event.headers };
    }
}

async function expectBlocked(path: string, method: string) {
    const response = await call(path, method);
    expect(response.statusCode, `${method} ${path}`).toBe(503);
    expect(response.headers["retry-after"], `${method} ${path} Retry-After`).toBe(String(READONLY_RETRY_AFTER_SECONDS));
}

async function expectAllowed(path: string, method = "GET") {
    const response = await call(path, method);
    expect(response.statusCode, `${method} ${path}`).toBeUndefined();
    expect(response.result, `${method} ${path}`).toBeUndefined();
}

describe("maintenance-readonly: the writes the plan names are refused with 503 + Retry-After", () => {
    it("RSVP (the public token path that every other mode leaves open)", async () => {
        await expectBlocked("/api/public/invite/tok123/rsvp", "POST");
    });

    it("checkout: Celebration unlock and the Creem plugin checkout", async () => {
        await expectBlocked("/api/events/evt1/unlock", "POST");
        await expectBlocked("/api/events/evt1/reconcile-unlock", "POST");
        await expectBlocked("/api/auth/creem/create-checkout", "POST");
    });

    it("upload: direct, presign and confirm (and the Worker storage bridge)", async () => {
        await expectBlocked("/api/file/upload", "POST");
        await expectBlocked("/api/file/presign", "POST");
        await expectBlocked("/api/file/confirm", "POST");
        await expectBlocked("/api/file/f1", "DELETE");
        await expectBlocked("/api/internal/storage/presign", "POST");
    });

    it("account mutations, on the app API and on Better Auth", async () => {
        await expectBlocked("/api/user/profile", "PATCH");
        await expectBlocked("/api/user/account", "DELETE");
        await expectBlocked("/api/user/data-export/request", "POST");
        for (const path of [
            "/api/auth/sign-up/email",
            "/api/auth/update-user",
            "/api/auth/change-password",
            "/api/auth/change-email",
            "/api/auth/delete-user",
            "/api/auth/reset-password",
            "/api/auth/request-password-reset",
            "/api/auth/two-factor/enable",
            "/api/auth/two-factor/disable",
            "/api/auth/two-factor/generate-backup-codes",
            "/api/auth/two-factor/verify-backup-code",
            "/api/auth/organization/create",
            "/api/auth/organization/invite-member",
            "/api/auth/organization/accept-invitation",
            "/api/auth/sign-in/social",
            "/en/api/auth/update-user",
        ]) {
            await expectBlocked(path, "POST");
        }
    });

    it("GETs that write: OAuth callback, email verification, cron", async () => {
        await expectBlocked("/api/auth/callback/google?code=x&state=y", "GET");
        await expectBlocked("/api/auth/verify-email?token=x", "GET");
        await expectBlocked("/api/cron/send-reminders", "GET");
        await expectBlocked("/api/cron/cleanup-files", "GET");
    });

    it("admin writes other than the site-mode toggle", async () => {
        await expectBlocked("/api/admin/users/u1", "PATCH");
        await expectBlocked("/api/admin/subscriptions/s1", "PATCH");
        await expectBlocked("/api/admin/cleanup-files", "POST");
    });

    it("a query string or a method it does not know does not open a write", async () => {
        await expectBlocked("/api/admin/site-mode/../users/u1", "PATCH");
        await expectBlocked("/api/public/invite/t/rsvp?x=/api/jobs/", "POST");
        await expectBlocked("/api/projects", "PROPFIND");
    });
});

describe("maintenance-readonly: pages, login and public reads stay open", () => {
    it("pages in every locale, the guest invite page and the admin console shell", async () => {
        for (const path of ["/", "/en", "/dashboard", "/dashboard/events/e1", "/login", "/en/login", "/e/slug/tok", "/blogs/post", "/admin"]) {
            await expectAllowed(path);
        }
    });

    it("the maintenance page is not served: the site is open", async () => {
        expect((await call("/maintenance")).result).toMatchObject({ redirect: "/" });
    });

    it("public and authenticated GETs", async () => {
        for (const path of [
            "/api/public/invite/tok123",
            "/api/public/preview?slug=a&sig=b",
            "/api/public/pixel/tok.gif",
            "/api/events",
            "/api/events/e1/guests",
            "/api/user/profile",
            "/api/auth/get-session",
            "/api/auth/convex/token",
            "/api/admin/site-mode",
            "/api/admin/users",
        ]) {
            await expectAllowed(path);
        }
        await expectAllowed("/api/events", "HEAD");
    });

    it("password login with TOTP and logout (sessions are ephemeral, never imported)", async () => {
        await expectAllowed("/api/auth/sign-in/email", "POST");
        await expectAllowed("/api/auth/two-factor/verify-totp", "POST");
        await expectAllowed("/api/auth/sign-out", "POST");
    });

    it("rollback controls and the drain paths", async () => {
        // The toggle that re-opens Vercel on a rollback.
        await expectAllowed("/api/admin/site-mode", "POST");
        await expectAllowed("/api/admin/site-mode", "DELETE");
        // Jobs already enqueued must finish *before* the watermark.
        await expectAllowed("/api/jobs/send-invite-email", "POST");
        // Creem: external truth with a short retry window, reconciled after the switch.
        await expectAllowed("/api/auth/creem/webhook", "POST");
        // Resend (Svix) retries for about a day: deferred, not written after the watermark.
        await expectBlocked("/api/webhooks/resend", "POST");
    });

    it("the auth catch-all serves the login subset instead of going dark", () => {
        expect(isAuthCatchAllOpen("maintenance-readonly", "/api/auth/sign-in/email")).toBe(true);
        expect(isAuthCatchAllOpen("maintenance-readonly", "/api/auth/get-session")).toBe(true);
        // Outside readonly the previous rules hold.
        expect(isAuthCatchAllOpen("maintenance", "/api/auth/sign-up/email")).toBe(false);
        expect(isAuthCatchAllOpen("maintenance", "/api/auth/get-session")).toBe(true);
        expect(isAuthCatchAllOpen("maintenance", "/api/auth/creem/webhook")).toBe(true);
        expect(isAuthCatchAllOpen("active", "/api/auth/sign-up/email")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Drift guards: derived from the filesystem, not from a hand list.
// ---------------------------------------------------------------------------

const API_ROOT = join(process.cwd(), "server/api");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return routeFiles(full);
        if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.endsWith(".d.ts")) return [];
        return [full];
    });
}

/** `server/api/events/[id]/guests/index.post.ts` → `{ path: /api/events/x/guests, method: POST }`. */
function toRoute(file: string): { path: string; method: string } | null {
    const rel = relative(API_ROOT, file).replace(/\\/g, "/").replace(/\.ts$/, "");
    const match = /^(.*?)(?:\.(get|post|put|patch|delete))?$/.exec(rel);
    if (!match) return null;
    const [, base, method] = match;
    if (!method) return null; // method-less handlers (auth catch-all): covered by the explicit cases
    const segments = base!.split("/").filter((s) => s !== "index").map((s) => (s.startsWith("[") ? "x" : s));
    return { path: `/api/${segments.join("/")}`, method: method.toUpperCase() };
}

const routes = routeFiles(API_ROOT).map(toRoute).filter((r): r is { path: string; method: string } => r !== null);

describe("maintenance-readonly: drift guards over server/api", () => {
    it("finds the routes (the guard is not vacuous)", () => {
        expect(routes.filter((r) => r.method !== "GET").length).toBeGreaterThan(30);
        expect(routes.filter((r) => r.method === "GET").length).toBeGreaterThan(25);
        expect(METHODS.length).toBe(5);
    });

    it("every write route on disk is refused unless explicitly allowlisted", async () => {
        const allowed: string[] = [];
        for (const route of routes.filter((r) => r.method !== "GET")) {
            const verdict = readonlyVerdict(route.path, route.method);
            if (verdict === "allow") {
                allowed.push(`${route.method} ${route.path}`);
                continue;
            }
            await expectBlocked(route.path, route.method);
        }
        // The complete list of writes the mode lets through. Growing it is a
        // decision, and this assertion is where that decision is made visible.
        expect(allowed.sort()).toEqual([
            "DELETE /api/admin/site-mode",
            "POST /api/admin/site-mode",
            "POST /api/jobs/x",
        ]);
        expect(READONLY_ALLOWED_WRITES.length).toBeGreaterThan(0);
    });

    it("every GET route on disk is classified (pure, side effect suppressed, or blocked)", () => {
        // Hand-audited on 2026-09-25: each of these handlers and the service it
        // calls was read for writes. A new GET fails here until someone does the same.
        const PURE_GETS = new Set([
            "/api/admin/audit-logs",
            "/api/admin/site-mode",
            "/api/admin/stats",
            "/api/admin/subscriptions",
            "/api/admin/users/x",
            "/api/admin/users/x/audit-logs",
            "/api/admin/users",
            "/api/admin/waiting-list/export",
            "/api/events/x",
            "/api/events/x/export",
            "/api/events/x/guests/x",
            "/api/events/x/guests/x/qr",
            "/api/events/x/guests",
            "/api/events/x/reminders",
            "/api/events/x/stats",
            "/api/events",
            "/api/file/x/url",
            "/api/organizations/x",
            "/api/organizations/x/members",
            "/api/organizations",
            "/api/projects/x",
            "/api/projects",
            "/api/public/preview",
            "/api/user/data-export/download/x",
            "/api/user/data-export/history",
            "/api/user/data-export/status",
            "/api/user/profile",
        ]);

        const unclassified = routes
            .filter((r) => r.method === "GET")
            .map((r) => r.path)
            .filter((path) => !PURE_GETS.has(path) && !READONLY_SIDE_EFFECT_READS.some((entry) => path.startsWith(entry.prefix)));
        expect(unclassified).toEqual([]);

        // Each side-effect GET is either refused or has its side effect suppressed
        // in the handler (and then the handler must say so — checked below).
        for (const entry of READONLY_SIDE_EFFECT_READS) {
            expect(["block", "suppress"]).toContain(entry.action);
        }
    });

    it("side-effect GETs marked `suppress` stay reachable; `block` ones are refused", async () => {
        for (const entry of READONLY_SIDE_EFFECT_READS) {
            const path = `${entry.prefix}sample`;
            if (entry.action === "block") await expectBlocked(path, "GET");
            else await expectAllowed(path, "GET");
        }
    });
});

describe("maintenance-readonly: suppressed side effects are suppressed in the handler", () => {
    it("shouldTrackReads() is false only in maintenance-readonly", async () => {
        await setServerSiteMode("active");
        expect(await shouldTrackReads()).toBe(true);
        await setServerSiteMode("maintenance");
        expect(await shouldTrackReads()).toBe(true);
        await setServerSiteMode("maintenance-readonly");
        expect(await shouldTrackReads()).toBe(false);
    });

    it("every `suppress` route handler consults shouldTrackReads()", () => {
        const suppressed = READONLY_SIDE_EFFECT_READS.filter((entry) => entry.action === "suppress");
        const handlers = routeFiles(API_ROOT).filter((file) => {
            const route = toRoute(file);
            return route?.method === "GET" && suppressed.some((entry) => route.path.startsWith(entry.prefix));
        });
        expect(handlers.length).toBeGreaterThanOrEqual(suppressed.length);
        for (const file of handlers) {
            expect(readFileSync(file, "utf8"), relative(process.cwd(), file)).toMatch(/shouldTrackReads\(\)/);
        }
    });
});
