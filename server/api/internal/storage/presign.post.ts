import {
    PRESIGN_EXPIRES_SECONDS,
    assertAllowedFileSize,
    assertAllowedMimeType,
    assertStorageKey,
} from "~~/server/services/file/bridgePolicy";
import { bridgeObjectStorage } from "~~/server/utils/storageBridgeObjects";
import { readBridgeRequest } from "~~/server/utils/storageBridge";

/**
 * `POST /api/internal/storage/presign` — the only place an upload URL is minted
 * (plan Task 7, Step 3).
 *
 * Convex never sees the R2 credentials; it asks this endpoint, which verifies the
 * HMAC and then applies its **own** limits — namespace, MIME allow-list from
 * `fileManager`, size cap, fixed 15-minute expiry. The caller cannot ask for a
 * longer-lived URL or a key outside `evt/{eventId}/{yyyy-MM}/{id}/original.ext`.
 */

const PATH = "/api/internal/storage/presign";

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
        // The limits come from the app's own config; the policy functions stay
        // pure, so the boundary is the only place that reads runtime config.
        const policy = useRuntimeConfig().fileManager ?? {};

        const key = assertStorageKey(request.payload.key);
        const mimeType = assertAllowedMimeType(policy, request.payload.mimeType);
        assertAllowedFileSize(policy, request.payload.fileSize);

        const storage = bridgeObjectStorage();
        const { url, expiresAt } = await storage.generatePresignedUploadUrl(
            key,
            mimeType,
            PRESIGN_EXPIRES_SECONDS,
        );

        return {
            ok: true,
            url,
            key,
            // Milliseconds: Convex stores `presignExpiresAt` as a number.
            expiresAt: expiresAt.getTime(),
        };
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        const code = (error as { data?: { code?: string } }).data?.code ?? "BRIDGE_PRESIGN_FAILED";
        return refusal(event, status, code);
    }
});
