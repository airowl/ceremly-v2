import { describe, expect, it } from "vitest";
import {
    isAdminBreakGlass,
    isAdminBreakGlassAuthApi,
    isAdminBreakGlassLogin,
    isAdminConsolePage,
} from "../../shared/constants/siteMode";

/**
 * Task 15 fix round 1 — the break-glass predicate shared by the server
 * middleware, the client middleware and the auth catch-all. The server matrix
 * lives in `site-mode-middleware.test.ts`; this pins the edges of the predicate
 * the client middleware uses (it receives `to.path` and `to.query.redirect`).
 */
describe("admin break-glass predicate", () => {
    it("matches the console in every locale, and nothing that only looks like it", () => {
        for (const path of ["/admin", "/admin/", "/admin/users", "/en/admin", "/en/admin/audit?action=x"]) {
            expect(isAdminConsolePage(path), path).toBe(true);
        }
        for (const path of ["/administrator", "/adminx", "/dashboard/admin", "/en/administrator", "/"]) {
            expect(isAdminConsolePage(path), path).toBe(false);
        }
    });

    it("lets the login page through only on its way to the console", () => {
        expect(isAdminBreakGlassLogin("/login", "/admin")).toBe(true);
        expect(isAdminBreakGlassLogin("/en/login", "/en/admin/jobs")).toBe(true);
        expect(isAdminBreakGlassLogin("/login?redirect=%2Fadmin%2Fusers")).toBe(true);
        expect(isAdminBreakGlassLogin("/login", "/dashboard")).toBe(false);
        expect(isAdminBreakGlassLogin("/login", "https://evil.example/admin")).toBe(false);
        expect(isAdminBreakGlassLogin("/login")).toBe(false);
        expect(isAdminBreakGlassLogin("/signup", "/admin")).toBe(false);
    });

    it("opens the session endpoints, never sign-up", () => {
        expect(isAdminBreakGlassAuthApi("/api/auth/get-session")).toBe(true);
        expect(isAdminBreakGlassAuthApi("/api/auth/convex/token")).toBe(true);
        expect(isAdminBreakGlassAuthApi("/api/auth/sign-in/email")).toBe(true);
        expect(isAdminBreakGlassAuthApi("/api/auth/sign-up/email")).toBe(false);
        expect(isAdminBreakGlassAuthApi("/api/auth/reset-password")).toBe(false);
        expect(isAdminBreakGlass("/api/projects")).toBe(false);
    });

    it("final review I2: exact sign-in paths only, never 2FA enable/disable or OAuth", () => {
        expect(isAdminBreakGlassAuthApi("/api/auth/two-factor/verify-totp")).toBe(true);
        expect(isAdminBreakGlassAuthApi("/api/auth/two-factor/verify-backup-code")).toBe(true);
        for (const path of [
            "/api/auth/two-factor/enable",
            "/api/auth/two-factor/disable",
            "/api/auth/two-factor/get-totp-uri",
            "/api/auth/two-factor/generate-backup-codes",
            "/api/auth/sign-in/social",
            "/api/auth/sign-in/email-otp",
            "/api/auth/sign-in/email/../social",
        ]) {
            expect(isAdminBreakGlassAuthApi(path, "POST"), path).toBe(false);
        }
        // The Convex token endpoint is a read: a write method on it is not break-glass.
        expect(isAdminBreakGlassAuthApi("/api/auth/convex/token", "GET")).toBe(true);
        expect(isAdminBreakGlassAuthApi("/api/auth/convex/token", "POST")).toBe(false);
    });
});
