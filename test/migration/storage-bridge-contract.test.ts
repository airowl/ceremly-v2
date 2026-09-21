import { beforeEach, describe, expect, it } from "vitest";
import { canonicalJson as convexCanonicalJson, signBridgeRequest as convexSign, verifyBridgeRequest as convexVerify } from "../../convex/lib/bridgeHmac";
import { canonicalJson as sharedCanonicalJson, constantTimeEqual } from "../../shared/migration/bridgeProtocol";
import {
    MemoryNonceStore,
    setBridgeNonceStore,
    signBridgeRequest as workerSign,
    verifyBridgeRequest as workerVerify,
} from "../../server/utils/storageBridge";
import {
    PRESIGN_EXPIRES_SECONDS,
    assertAllowedFileSize,
    assertAllowedMimeType,
    assertBasePath,
    assertStorageKey,
    bridgeVariantKey,
    objectKeyPattern,
} from "../../server/services/file/bridgePolicy";

/**
 * Task 7 — the Convex ⇄ Worker bridge, verified without Cloudflare.
 *
 * The bridge is the piece that holds the R2 credentials, so its *security
 * properties* are what the gate must pin: the two runtimes sign identical bytes
 * (no drift between the mirror and the spec), a stale / retargeted / tampered
 * request is refused, and a replayed nonce is refused even when still fresh.
 *
 * The R2 and Images calls themselves are exercised by the live gate; here nothing
 * touches the network.
 */

const SECRET = "bridge-secret-under-test";
const PATH = "/api/internal/storage/presign";
const PAYLOAD = {
    key: "global/2026-09/abc/original.png",
    mimeType: "image/png",
    fileSize: 1024,
    organizationId: "org_1",
};

beforeEach(() => {
    setBridgeNonceStore(new MemoryNonceStore());
});

describe("bridge: the two runtimes sign the same bytes", () => {
    it("canonicalises identically, including nested objects and undefined keys", () => {
        const samples: unknown[] = [
            { b: 1, a: 2 },
            { z: { y: [3, 2, 1], x: "s" }, a: null },
            { keep: "v", drop: undefined },
            { nested: { drop: undefined, keep: true }, list: [{ b: 1, a: 2 }] },
            new Date("2026-09-21T10:00:00.000Z"),
            [1, "two", { three: 3 }],
            "plain",
            42,
        ];

        for (const sample of samples) {
            expect(convexCanonicalJson(sample)).toBe(sharedCanonicalJson(sample));
        }
    });

    it("a signature produced by Convex verifies in the Worker (and vice versa)", async () => {
        const fromConvex = await convexSign({
            secret: SECRET,
            method: "POST",
            path: PATH,
            payload: PAYLOAD,
            now: 1_700_000_000_000,
            nonce: "nonce-convex",
        });

        const verifiedByWorker = await workerVerify({
            secret: SECRET,
            method: "POST",
            path: PATH,
            headers: fromConvex.headers,
            body: fromConvex.body,
            now: 1_700_000_000_000,
        });
        expect(verifiedByWorker).toEqual({ ok: true });

        const fromWorker = await workerSign({
            secret: SECRET,
            method: "POST",
            path: "/media/variant-result",
            payload: { fileId: "f1", ok: true },
            now: 1_700_000_000_000,
            nonce: "nonce-worker",
        });
        const verifiedByConvex = await convexVerify({
            secret: SECRET,
            method: "POST",
            path: "/media/variant-result",
            headers: fromWorker.headers,
            body: fromWorker.body,
            now: 1_700_000_000_000,
        });
        expect(verifiedByConvex).toEqual({ ok: true });
    });

    it("uses a constant-time comparison", () => {
        expect(constantTimeEqual("abc", "abc")).toBe(true);
        expect(constantTimeEqual("abc", "abd")).toBe(false);
        expect(constantTimeEqual("abc", "abcd")).toBe(false);
        expect(constantTimeEqual("", "")).toBe(true);
    });
});

describe("bridge: a request must be fresh, targeted and intact", () => {
    const signed = (overrides: { now?: number; path?: string } = {}) =>
        workerSign({
            secret: SECRET,
            method: "POST",
            path: overrides.path ?? PATH,
            payload: PAYLOAD,
            now: overrides.now ?? 1_700_000_000_000,
            nonce: `nonce-${Math.random()}`,
        });

    it("accepts a fresh, correctly targeted request", async () => {
        const request = await signed();
        expect(
            await workerVerify({ secret: SECRET, method: "POST", path: PATH, headers: request.headers, body: request.body, now: 1_700_000_000_000 }),
        ).toEqual({ ok: true });
    });

    it("refuses a stale timestamp", async () => {
        const request = await signed();
        const result = await workerVerify({
            secret: SECRET,
            method: "POST",
            path: PATH,
            headers: request.headers,
            body: request.body,
            now: 1_700_000_000_000 + 61_000,
        });
        expect(result).toEqual({ ok: false, code: "BRIDGE_TIMESTAMP_STALE" });
    });

    it("refuses a signature aimed at another path or method", async () => {
        const request = await signed();
        expect(
            await workerVerify({ secret: SECRET, method: "POST", path: "/api/internal/storage/object", headers: request.headers, body: request.body, now: 1_700_000_000_000 }),
        ).toEqual({ ok: false, code: "BRIDGE_SIGNATURE_INVALID" });

        expect(
            await workerVerify({ secret: SECRET, method: "GET", path: PATH, headers: request.headers, body: request.body, now: 1_700_000_000_000 }),
        ).toEqual({ ok: false, code: "BRIDGE_SIGNATURE_INVALID" });
    });

    it("refuses a tampered body", async () => {
        const request = await signed();
        const tampered = request.body.replace("1024", "9999");
        expect(tampered).not.toBe(request.body);
        expect(
            await workerVerify({ secret: SECRET, method: "POST", path: PATH, headers: request.headers, body: tampered, now: 1_700_000_000_000 }),
        ).toEqual({ ok: false, code: "BRIDGE_SIGNATURE_INVALID" });
    });

    it("refuses a wrong secret and missing headers", async () => {
        const request = await signed();
        expect(
            await workerVerify({ secret: "other-secret", method: "POST", path: PATH, headers: request.headers, body: request.body, now: 1_700_000_000_000 }),
        ).toEqual({ ok: false, code: "BRIDGE_SIGNATURE_INVALID" });

        expect(
            await workerVerify({ secret: SECRET, method: "POST", path: PATH, headers: {}, body: request.body, now: 1_700_000_000_000 }),
        ).toEqual({ ok: false, code: "BRIDGE_SIGNATURE_MISSING" });
    });

    it("refuses a replayed nonce even inside the freshness window", async () => {
        const request = await signed();
        const args = { secret: SECRET, method: "POST" as const, path: PATH, headers: request.headers, body: request.body, now: 1_700_000_000_000 };

        expect(await workerVerify(args)).toEqual({ ok: true });
        expect(await workerVerify(args)).toEqual({ ok: false, code: "BRIDGE_NONCE_REPLAYED" });
    });
});

describe("bridge policy: the Worker applies its own limits", () => {
    it("accepts only keys inside the storage namespace", () => {
        expect(assertStorageKey("global/2026-09/abc/original.png")).toBe("global/2026-09/abc/original.png");
        expect(assertStorageKey("evt/evt_1/2026-09/abc/original")).toBe("evt/evt_1/2026-09/abc/original");

        for (const key of [
            "global/2026-09/abc/../../etc/passwd",
            "/global/2026-09/abc/original.png",
            "global/2026-09/abc/thumb.webp",
            "other/2026-09/abc/original.png",
            "global/2026-09/abc/original.png?x=1",
            "",
        ]) {
            expect(() => assertStorageKey(key), key).toThrow();
        }

        // Variants are allowed only where the derived names are expected.
        expect(assertStorageKey("global/2026-09/abc/thumb.webp", true)).toBe("global/2026-09/abc/thumb.webp");
        expect(objectKeyPattern.test("global/2026-09/abc/web.webp")).toBe(true);
        expect(objectKeyPattern.test("global/2026-09/abc/other.webp")).toBe(false);
    });

    it("uses the application's MIME allow-list and size cap", () => {
        // The same values `server/utils/runtimeConfig.ts` puts in `fileManager`.
        const policy = {
            maxFileSize: 5 * 1024 * 1024,
            allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        };

        expect(assertAllowedMimeType(policy, "image/png")).toBe("image/png");
        expect(() => assertAllowedMimeType(policy, "image/svg+xml")).toThrow();
        expect(() => assertAllowedMimeType(policy, "text/html")).toThrow();
        expect(() => assertAllowedMimeType(policy, "application/zip")).toThrow();

        expect(assertAllowedFileSize(policy, 1024)).toBe(1024);
        expect(() => assertAllowedFileSize(policy, 5 * 1024 * 1024 + 1)).toThrow();
        expect(() => assertAllowedFileSize(policy, 0)).toThrow();
        expect(() => assertAllowedFileSize(policy, Number.NaN)).toThrow();
    });

    it("accepts only a well-formed media base path and derives the variant keys", () => {
        expect(assertBasePath("global/2026-09/abc")).toBe("global/2026-09/abc");
        expect(() => assertBasePath("global/2026-09")).toThrow();
        expect(() => assertBasePath("global/2026-09/abc/thumb.webp")).toThrow();

        expect(bridgeVariantKey("global/2026-09/abc", "thumb")).toBe("global/2026-09/abc/thumb.webp");
        expect(bridgeVariantKey("global/2026-09/abc", "web")).toBe("global/2026-09/abc/web.webp");
        expect(PRESIGN_EXPIRES_SECONDS).toBe(900);
    });
});
