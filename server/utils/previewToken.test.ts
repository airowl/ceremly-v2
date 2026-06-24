import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { signPreviewToken, verifyPreviewToken } from "./previewToken";

const SECRET = "test-preview-secret";

// useRuntimeConfig è un auto-import Nitro: lo stubbiamo solo per questo file
// (vi.unstubAllGlobals ripristina — test/setup.ts vieta di polyfillarlo globalmente).
beforeEach(() => {
    vi.stubGlobal("useRuntimeConfig", () => ({ betterAuthSecret: SECRET }));
});
afterEach(() => {
    vi.unstubAllGlobals();
});

/** Forgia un token con scadenza arbitraria ma firma valida (controlliamo il secret). */
function forge(slug: string, exp: number): string {
    const hmac = createHmac("sha256", SECRET).update(`preview:${slug}:${exp}`).digest("hex");
    return `${exp}.${hmac}`;
}
const nowSec = () => Math.floor(Date.now() / 1000);

describe("previewToken", () => {
    it("roundtrip: un token appena firmato è valido", () => {
        expect(verifyPreviewToken("evento-x", signPreviewToken("evento-x"))).toBe(true);
    });

    it("rifiuta la firma di uno slug diverso", () => {
        expect(verifyPreviewToken("evento-y", signPreviewToken("evento-x"))).toBe(false);
    });

    it("rifiuta token vuoto o malformato (senza punto)", () => {
        expect(verifyPreviewToken("evento-x", "")).toBe(false);
        expect(verifyPreviewToken("evento-x", "nopunto")).toBe(false);
        expect(verifyPreviewToken("evento-x", ".soloesadecimale")).toBe(false);
    });

    it("rifiuta un token scaduto anche se la firma è valida", () => {
        expect(verifyPreviewToken("evento-x", forge("evento-x", nowSec() - 10))).toBe(false);
    });

    it("accetta un token non ancora scaduto con firma valida", () => {
        expect(verifyPreviewToken("evento-x", forge("evento-x", nowSec() + 3600))).toBe(true);
    });

    it("rifiuta exp manomesso (estende la scadenza ma rompe l'HMAC)", () => {
        const valid = signPreviewToken("evento-x");
        const tampered = `${nowSec() + 999_999}.${valid.split(".")[1]}`;
        expect(verifyPreviewToken("evento-x", tampered)).toBe(false);
    });
});
