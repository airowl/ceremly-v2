import { describe, it, expect } from "vitest";
import { shouldBanGuardPath } from "./authBanGuard";

describe("shouldBanGuardPath", () => {
    it("guards organization mutating endpoints", () => {
        expect(shouldBanGuardPath("/organization/create-invitation")).toBe(true);
        expect(shouldBanGuardPath("/organization/update-member-role")).toBe(true);
        expect(shouldBanGuardPath("/organization/set-active")).toBe(true);
    });
    it("guards admin endpoints", () => {
        expect(shouldBanGuardPath("/admin/impersonate-user")).toBe(true);
    });
    it("guards creem billing endpoints", () => {
        expect(shouldBanGuardPath("/creem/create-checkout")).toBe(true);
    });
    it("does NOT guard sign-out or session reads (avoid locking a user out of logging out)", () => {
        expect(shouldBanGuardPath("/sign-out")).toBe(false);
        expect(shouldBanGuardPath("/get-session")).toBe(false);
    });
    it("does NOT guard unauthenticated paths (no session yet)", () => {
        expect(shouldBanGuardPath("/sign-in/email")).toBe(false);
        expect(shouldBanGuardPath("/request-password-reset")).toBe(false);
    });
});
