import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { signPreviewToken, verifyPreviewToken } from "./previewToken";

const SECRET = "test-preview-secret";

// useRuntimeConfig is a Nitro auto-import: we stub it only for this file
// (vi.unstubAllGlobals restores it — test/setup.ts forbids polyfilling it globally).
beforeEach(() => {
    vi.stubGlobal("useRuntimeConfig", () => ({ betterAuthSecret: SECRET }));
});
afterEach(() => {
    vi.unstubAllGlobals();
});

/** Forges a token with an arbitrary expiry but a valid signature (we control the secret). */
function forge(slug: string, exp: number): string {
    const hmac = createHmac("sha256", SECRET).update(`preview:${slug}:${exp}`).digest("hex");
    return `${exp}.${hmac}`;
}
const nowSec = () => Math.floor(Date.now() / 1000);

describe("previewToken", () => {
    it("roundtrip: a freshly signed token is valid", () => {
        expect(verifyPreviewToken("evento-x", signPreviewToken("evento-x"))).toBe(true);
    });

    it("rejects the signature of a different slug", () => {
        expect(verifyPreviewToken("evento-y", signPreviewToken("evento-x"))).toBe(false);
    });

    it("rejects an empty or malformed token (no dot)", () => {
        expect(verifyPreviewToken("evento-x", "")).toBe(false);
        expect(verifyPreviewToken("evento-x", "nopunto")).toBe(false);
        expect(verifyPreviewToken("evento-x", ".soloesadecimale")).toBe(false);
    });

    it("rejects an expired token even if the signature is valid", () => {
        expect(verifyPreviewToken("evento-x", forge("evento-x", nowSec() - 10))).toBe(false);
    });

    it("accepts a not-yet-expired token with a valid signature", () => {
        expect(verifyPreviewToken("evento-x", forge("evento-x", nowSec() + 3600))).toBe(true);
    });

    it("rejects a tampered exp (extends the expiry but breaks the HMAC)", () => {
        const valid = signPreviewToken("evento-x");
        const tampered = `${nowSec() + 999_999}.${valid.split(".")[1]}`;
        expect(verifyPreviewToken("evento-x", tampered)).toBe(false);
    });
});
