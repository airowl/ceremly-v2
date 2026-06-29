import { describe, it, expect } from "vitest";
import { contrastRatio, isReadable, deriveSoft, deriveInk, deriveLine, hexToRgb, relativeLuminance } from "./inviteColor";

describe("inviteColor", () => {
    it("contrastRatio black/white = 21", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    });
    it("contrastRatio is symmetric", () => {
        expect(contrastRatio("#d4a373", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#d4a373"), 5);
    });
    it("isReadable: white on black ok, light grey on white no", () => {
        expect(isReadable("#ffffff", "#000000")).toBe(true);
        expect(isReadable("#cccccc", "#ffffff")).toBe(false);
    });
    it("hexToRgb rejects non-#rrggbb hex", () => {
        expect(() => hexToRgb("#abc")).toThrow();
        expect(() => hexToRgb("rosso")).toThrow();
    });
    it("deriveSoft returns a valid light hex tint", () => {
        const soft = deriveSoft("#8C3B4A");
        expect(soft).toMatch(/^#[0-9a-f]{6}$/);
        // lighter than the accent: luminance close to white
        expect(hexToRgb(soft).r).toBeGreaterThan(hexToRgb("#8C3B4A").r);
        expect(relativeLuminance(soft)).toBeGreaterThan(relativeLuminance("#8C3B4A"));
    });
    it("deriveInk: light text on dark paper, dark text on light paper", () => {
        expect(isReadable(deriveInk("#1E1A12").ink, "#1E1A12")).toBe(true); // dark paper → light readable ink
        expect(isReadable(deriveInk("#FFFFFF").ink, "#FFFFFF")).toBe(true); // light paper → dark readable ink
        expect(relativeLuminance(deriveInk("#1E1A12").ink)).toBeGreaterThan(relativeLuminance(deriveInk("#FFFFFF").ink));
    });
    it("deriveLine: valid hex, subtle line (stays close to the paper)", () => {
        const line = deriveLine("#FFFFFF");
        expect(line).toMatch(/^#[0-9a-f]{6}$/);
        // 14% toward ink: just darker than white paper, but not black
        expect(hexToRgb(line).r).toBeLessThan(255);
        expect(hexToRgb(line).r).toBeGreaterThan(200);
    });
});
