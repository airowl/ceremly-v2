import { describe, it, expect } from "vitest";
import { contrastRatio, isReadable, deriveSoft, deriveInk, deriveLine, hexToRgb, relativeLuminance } from "./inviteColor";

describe("inviteColor", () => {
    it("contrastRatio nero/bianco = 21", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    });
    it("contrastRatio è simmetrico", () => {
        expect(contrastRatio("#d4a373", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#d4a373"), 5);
    });
    it("isReadable: bianco su nero ok, grigio chiaro su bianco no", () => {
        expect(isReadable("#ffffff", "#000000")).toBe(true);
        expect(isReadable("#cccccc", "#ffffff")).toBe(false);
    });
    it("hexToRgb rifiuta hex non #rrggbb", () => {
        expect(() => hexToRgb("#abc")).toThrow();
        expect(() => hexToRgb("rosso")).toThrow();
    });
    it("deriveSoft restituisce una tinta chiara hex valida", () => {
        const soft = deriveSoft("#8C3B4A");
        expect(soft).toMatch(/^#[0-9a-f]{6}$/);
        // più chiaro dell'accento: luminanza vicina al bianco
        expect(hexToRgb(soft).r).toBeGreaterThan(hexToRgb("#8C3B4A").r);
        expect(relativeLuminance(soft)).toBeGreaterThan(relativeLuminance("#8C3B4A"));
    });
    it("deriveInk: testo chiaro su carta scura, scuro su carta chiara", () => {
        expect(isReadable(deriveInk("#1E1A12").ink, "#1E1A12")).toBe(true); // paper scuro → ink chiaro leggibile
        expect(isReadable(deriveInk("#FFFFFF").ink, "#FFFFFF")).toBe(true); // paper chiaro → ink scuro leggibile
        expect(relativeLuminance(deriveInk("#1E1A12").ink)).toBeGreaterThan(relativeLuminance(deriveInk("#FFFFFF").ink));
    });
    it("deriveLine: hex valido, linea tenue (resta vicina al paper)", () => {
        const line = deriveLine("#FFFFFF");
        expect(line).toMatch(/^#[0-9a-f]{6}$/);
        // 14% verso l'inchiostro: appena più scura del paper bianco, ma non nera
        expect(hexToRgb(line).r).toBeLessThan(255);
        expect(hexToRgb(line).r).toBeGreaterThan(200);
    });
});
