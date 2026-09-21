import { describe, expect, it } from "vitest";
import { validateMagicBytes as convexValidate } from "../../convex/lib/magicBytes";
import { validateMagicBytes as legacyValidate } from "../../server/services/file/magicBytes";

/**
 * Task 7 — the magic-bytes check exists twice on purpose.
 *
 * Convex bundles only files under `convex/`, so `convex/lib/magicBytes.ts` mirrors
 * `server/services/file/magicBytes.ts`. The copy is only acceptable if the two
 * cannot drift: this test feeds both the same byte samples and fails on any
 * disagreement. It is the reason the duplicate is allowed to exist.
 */

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

const SAMPLES: Array<{ name: string; data: Uint8Array }> = [
    { name: "png", data: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13) },
    { name: "jpeg", data: bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46) },
    { name: "gif", data: bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61) },
    { name: "webp", data: bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50) },
    { name: "pdf", data: bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37) },
    { name: "avif", data: bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66) },
    { name: "avis", data: bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73) },
    { name: "svg", data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">') },
    { name: "html", data: new TextEncoder().encode("<!doctype html><script>alert(1)</script>") },
    { name: "empty", data: bytes() },
    { name: "riff-but-not-webp", data: bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20) },
    { name: "ftyp-but-not-avif", data: bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32) },
];

const MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "application/pdf",
    "image/svg+xml",
    "text/html",
    "application/zip",
];

describe("magic bytes: Convex and legacy validators agree", () => {
    it("returns the same verdict for every sample × type pair", () => {
        for (const sample of SAMPLES) {
            for (const mimeType of MIME_TYPES) {
                expect(
                    convexValidate(sample.data, mimeType),
                    `${sample.name} as ${mimeType}`,
                ).toBe(legacyValidate(sample.data, mimeType));
            }
        }
    });

    it("still refuses the cases the check exists for", () => {
        // Guard against the loop above silently agreeing on a broken pair.
        expect(convexValidate(bytes(0, 1, 2, 3), "image/png")).toBe(false);
        expect(convexValidate(new TextEncoder().encode("<html>"), "image/png")).toBe(false);
        expect(convexValidate(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20), "image/webp")).toBe(false);
        expect(convexValidate(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png")).toBe(true);
    });
});
