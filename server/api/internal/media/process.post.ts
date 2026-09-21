import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import {
    assertBasePath,
    assertProcessableMimeType,
    assertStorageKey,
    bridgeVariantKey,
} from "~~/server/services/file/bridgePolicy";
import { computeSHA256 } from "~~/server/services/file/hash";
import { bridgeImages, bridgeR2Bucket } from "~~/server/utils/storageBridgeObjects";
import { readBridgeRequest, signBridgeRequest } from "~~/server/utils/storageBridge";

/**
 * `POST /api/internal/media/process` — generates the observable image variants
 * (plan Task 7, Step 3).
 *
 * Runs **on Cloudflare**, next to the bucket: reads the original through the R2
 * binding, transforms it with the Images binding and writes
 * `{basePath}/thumb.webp` (400px, q80) and `{basePath}/web.webp` (1600px, q85) —
 * the same keys the legacy Sharp pipeline wrote, so existing objects and new ones
 * are indistinguishable to consumers.
 *
 * The result is reported back to Convex with the same HMAC the request arrived
 * with (re-signed per request, so the callback is not a replayable copy). There is
 * **no silent empty result**: a failure calls back `ok: false` and answers 502, so
 * Convex records a real attempt and the retry rule owns what happens next.
 */

const PATH = "/api/internal/media/process";
/** Must match the route registered in `convex/http.ts`. */
const CALLBACK_PATH = "/media/variant-result";

const VARIANT_LIMIT = 2;

interface VariantRequest {
    type: "thumb" | "web";
    width: number;
    quality: number;
}

function refusal(event: H3Event<EventHandlerRequest>, status: number, code: string) {
    setResponseStatus(event, status);
    return { ok: false, code };
}

export default defineEventHandler(async (event) => {
    const request = await readBridgeRequest(event, PATH);
    if (!request.ok) {
        return refusal(event, request.status, request.code);
    }

    let fileId = "";
    try {
        fileId = String(request.payload.fileId ?? "");
        const key = assertStorageKey(request.payload.key);
        const basePath = assertBasePath(request.payload.basePath);
        assertProcessableMimeType(request.payload.mimeType);

        const requested = request.payload.variants;
        if (!Array.isArray(requested) || requested.length === 0 || requested.length > VARIANT_LIMIT) {
            return refusal(event, 400, "BRIDGE_VARIANT_COUNT_INVALID");
        }

        const specs = requested.map((raw) => normalizeVariant(raw)).filter((spec): spec is VariantRequest => spec !== null);
        if (specs.length !== requested.length) {
            return refusal(event, 400, "BRIDGE_VARIANT_INVALID");
        }

        const bucket = bridgeR2Bucket(event);
        const images = bridgeImages(event);

        const original = await bucket.get(key);
        if (!original) {
            await notifyConvex(request.secret, { fileId, ok: false, error: "object_missing" });
            return refusal(event, 502, "BRIDGE_ORIGINAL_MISSING");
        }

        const originalBytes = new Uint8Array(await original.arrayBuffer());

        const results: Array<{ type: string; key: string; size: number; sha256: string }> = [];
        for (const spec of specs) {
            const output = await images
                .input(originalBytes)
                .transform({ width: spec.width, fit: "scale-down" })
                .output({ format: "image/webp", quality: spec.quality });

            const bytes = new Uint8Array(await output.response().arrayBuffer());
            const variantObjectKey = bridgeVariantKey(basePath, spec.type);

            await bucket.put(variantObjectKey, bytes, {
                httpMetadata: {
                    contentType: "image/webp",
                    cacheControl: "public, max-age=31536000, immutable",
                },
            });

            results.push({
                type: spec.type,
                key: variantObjectKey,
                size: bytes.length,
                sha256: await computeSHA256(bytes),
            });
        }

        await notifyConvex(request.secret, { fileId, ok: true, variants: results });

        return { ok: true, variants: results.map(({ type, key: variantKey, size }) => ({ type, key: variantKey, size })) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Best-effort callback: if this also fails, the Convex action's own
        // non-2xx handling records the attempt, so nothing is lost silently.
        try {
            await notifyConvex(request.secret, { fileId, ok: false, error: message });
        } catch (callbackError) {
            console.error("[media-process] failure callback also failed", callbackError);
        }
        return refusal(event, 502, "BRIDGE_MEDIA_FAILED");
    }
});

/** Validates a variant request against the bridge's own policy, not the caller's. */
function normalizeVariant(raw: unknown): VariantRequest | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Record<string, unknown>;
    const type = candidate.type;
    if (type !== "thumb" && type !== "web") return null;

    // The width/quality are re-derived here: a caller must not be able to ask for
    // a 5000px variant that quietly blows up storage cost.
    const expected = type === "thumb" ? { width: 400, quality: 80 } : { width: 1600, quality: 85 };
    if (candidate.width !== expected.width || candidate.quality !== expected.quality) return null;

    return { type, width: expected.width, quality: expected.quality };
}

/** Reports the outcome to Convex, signed with a fresh nonce. */
async function notifyConvex(secret: string, payload: Record<string, unknown>): Promise<void> {
    const siteUrl = useRuntimeConfig().public.convexSiteUrl;
    if (!siteUrl) {
        throw new Error("convex site url is not configured");
    }

    const signed = await signBridgeRequest({
        secret,
        method: "POST",
        path: CALLBACK_PATH,
        payload,
    });

    const response = await fetch(`${siteUrl.replace(/\/+$/, "")}${CALLBACK_PATH}`, {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
    });

    if (!response.ok) {
        throw new Error(`variant result callback failed: ${response.status}`);
    }
}
