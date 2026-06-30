import { describe, it, expect } from "vitest";
import { isBanActive } from "./banStatus";

const now = new Date("2026-06-30T12:00:00Z");

describe("isBanActive", () => {
    it("is false when not banned", () => {
        expect(isBanActive(false, null, now)).toBe(false);
        expect(isBanActive(null, null, now)).toBe(false);
        expect(isBanActive(undefined, new Date("2030-01-01T00:00:00Z"), now)).toBe(false);
    });

    it("is true for a permanent ban (banExpires null) — covers deletion grace", () => {
        expect(isBanActive(true, null, now)).toBe(true);
        expect(isBanActive(true, undefined, now)).toBe(true);
    });

    it("is active when banExpires is in the future", () => {
        expect(isBanActive(true, new Date("2026-06-30T13:00:00Z"), now)).toBe(true);
    });

    it("is expired when banExpires is in the past", () => {
        expect(isBanActive(true, new Date("2026-06-30T11:00:00Z"), now)).toBe(false);
    });
});
