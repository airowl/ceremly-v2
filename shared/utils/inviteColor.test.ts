import { describe, it, expect } from "vitest";
import { contrastRatio, isReadable, deriveSoft, hexToRgb } from "./inviteColor";

describe("inviteColor", () => {
    it("contrastRatio nero/bianco = 21", () => {
        expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
    });
    it("contrastRatio è simmetrico", () => {
        expect(contrastRatio("#d4a373", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#d4a373"), 5);
    });
    it("isReadable: bianco su nero ok, grigio chiaro su bianco no", () => {
        expect(isReadable("#ffffff", "#000000")).toBe(true);
        expect(isReadable("#cccccc", "#ffffff")).toBe(false);
    });
    it("deriveSoft restituisce una tinta chiara hex valida", () => {
        const soft = deriveSoft("#8C3B4A");
        expect(soft).toMatch(/^#[0-9a-f]{6}$/);
        // più chiaro dell'accento: luminanza vicina al bianco
        expect(hexToRgb(soft).r).toBeGreaterThan(hexToRgb("#8C3B4A").r);
    });
});
