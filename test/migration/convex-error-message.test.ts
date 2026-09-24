import { afterEach, describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { KNOWN_ERROR_MESSAGES, convexErrorCode, convexErrorMessage } from "../../app/composables/useConvexError";

/**
 * Final review M6 — during the cutover window every write returns
 * `SITE_READ_ONLY` (`convex/lib/writeGuard.ts`). The UI must show a sentence,
 * not the raw code, in the page's language.
 */
const g = globalThis as { document?: unknown };
const original = g.document;

afterEach(() => {
    g.document = original;
});

const readOnly = new ConvexError({ code: "SITE_READ_ONLY", mode: "maintenance-readonly", policy: "domain" });

describe("convexErrorMessage: known codes", () => {
    it("SITE_READ_ONLY is a sentence in Italian by default, never the raw code", () => {
        g.document = undefined;
        const message = convexErrorMessage(readOnly);
        expect(message).toBe(KNOWN_ERROR_MESSAGES.SITE_READ_ONLY!.it);
        expect(message).not.toContain("SITE_READ_ONLY");
        expect(convexErrorCode(readOnly)).toBe("SITE_READ_ONLY");
    });

    it("follows <html lang> for English", () => {
        g.document = { documentElement: { lang: "en-US" } };
        expect(convexErrorMessage(readOnly)).toBe(KNOWN_ERROR_MESSAGES.SITE_READ_ONLY!.en);
    });

    it("messages carry no '@' (vue-i18n gotcha) and unknown codes keep the old behaviour", () => {
        for (const entry of Object.values(KNOWN_ERROR_MESSAGES)) {
            expect(entry.it).not.toContain("@");
            expect(entry.en).not.toContain("@");
        }
        expect(convexErrorMessage(new ConvexError({ code: "GUEST_LIMIT_REACHED" }))).toBe("GUEST_LIMIT_REACHED");
        expect(convexErrorMessage(new ConvexError({ code: "X", message: "Testo" }))).toBe("Testo");
    });
});
