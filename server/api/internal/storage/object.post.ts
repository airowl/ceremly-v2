import {
    DOWNLOAD_EXPIRES_SECONDS,
    assertExportKey,
    assertExportSize,
    assertStorageKey,
} from "~~/server/services/file/bridgePolicy";
import { computeSHA256 } from "~~/server/services/file/hash";
import { bridgeObjectStorage, bridgeR2Bucket } from "~~/server/utils/storageBridgeObjects";
import { readBridgeRequest } from "~~/server/utils/storageBridge";

/**
 * `POST /api/internal/storage/object` — object operations the bridge performs on
 * Convex's behalf (plan Task 7, Step 3).
 *
 * Four ops, one endpoint (one signature scheme, one allow-list):
 * - `inspect`: existence + size + content digest + the first 256 bytes. The digest
 *   and the header are computed **here**, in the Worker, so a 5 MB upload never
 *   travels back through Convex as a body; Convex only receives what the
 *   transition needs.
 * - `delete`: used for a failed or deduplicated upload, by `files.remove`, and by
 *   the GDPR purge.
 * - `sign-download`: a short-lived GET URL, only ever after Convex has authorized
 *   the caller.
 * - `put` (Task 12): writes a generated document — the GDPR export JSON — into the
 *   `exports/` namespace. It goes through the **R2 binding**, not the S3 client:
 *   the binding is the Worker-native API and takes bytes directly, while the S3
 *   `upload()` helper of the legacy provider hardcodes `public, max-age=31536000,
 *   immutable`, which is exactly the wrong cache semantics for a personal
 *   document that must expire in 24 hours.
 */

const PATH = "/api/internal/storage/object";

function refusal(event: Parameters<typeof readBridgeRequest>[0], status: number, code: string) {
    setResponseStatus(event, status);
    return { ok: false, code };
}

export default defineEventHandler(async (event) => {
    const request = await readBridgeRequest(event, PATH);
    if (!request.ok) {
        return refusal(event, request.status, request.code);
    }

    try {
        const op = request.payload.op;

        // `put` writes into the export namespace and validates its own key; every
        // other op stays on the image namespace, where `allowVariants` widens the
        // pattern by exactly the two derived names.
        if (op === "put") {
            const exportKey = assertExportKey(request.payload.key);
            const base64 = request.payload.body;
            if (typeof base64 !== "string" || base64.length === 0) {
                return refusal(event, 400, "BRIDGE_BODY_INVALID");
            }

            const exportBytes = fromBase64(base64);
            assertExportSize(exportBytes.byteLength);

            await bridgeR2Bucket(event).put(exportKey, exportBytes, {
                httpMetadata: {
                    contentType: "application/json",
                    contentDisposition: "attachment; filename=\"ceremly-export.json\"",
                    cacheControl: "private, no-store",
                },
            });

            return { ok: true, key: exportKey, size: exportBytes.byteLength };
        }

        const key = assertStorageKey(request.payload.key, true);
        const storage = bridgeObjectStorage();

        if (op === "inspect") {
            let bytes: Uint8Array;
            try {
                bytes = await storage.download(key);
            } catch {
                // "Not there" is a result, not an error: Convex marks the upload
                // failed with its own code.
                return { ok: true, exists: false, size: 0, sha256: "", headBytes: "" };
            }

            const head = bytes.slice(0, 256);
            return {
                ok: true,
                exists: true,
                size: bytes.length,
                sha256: await computeSHA256(bytes),
                headBytes: toBase64(head),
            };
        }

        if (op === "delete") {
            await storage.delete(key);
            return { ok: true, deleted: true, key };
        }

        if (op === "sign-download") {
            const requested = request.payload.expiresInSeconds;
            // Never longer than the bridge's own cap, whatever the caller asked.
            const seconds =
                typeof requested === "number" && Number.isFinite(requested)
                    ? Math.min(Math.max(Math.trunc(requested), 1), DOWNLOAD_EXPIRES_SECONDS)
                    : DOWNLOAD_EXPIRES_SECONDS;

            const url = await storage.generatePresignedDownloadUrl(key, seconds);
            return { ok: true, url, expiresAt: Date.now() + seconds * 1000 };
        }

        return refusal(event, 400, "BRIDGE_OP_UNKNOWN");
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        const code = (error as { data?: { code?: string } }).data?.code ?? "BRIDGE_OBJECT_FAILED";
        return refusal(event, status, code);
    }
});

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
