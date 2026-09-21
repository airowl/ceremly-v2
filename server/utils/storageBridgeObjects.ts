import type { R2Bucket } from "@cloudflare/workers-types";
import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import type { ImagesBinding } from "~~/server/types/images";
import { createR2Storage, type R2StorageProvider } from "~~/server/services/file/storage/r2";
import type { R2Config } from "~~/server/services/file/types";

/**
 * Access to storage from the bridge handlers (plan Task 7).
 *
 * Two different doors on purpose:
 * - the **S3 API** (aws4fetch, credentials) signs URLs and does HEAD/GET/DELETE —
 *   the binding cannot presign, and the legacy provider already does all of this;
 * - the **R2 binding** (`event.context.cloudflare.env.CEREMLY_R2`) reads and writes
 *   object bodies inside the Worker, which is what the media bridge needs
 *   alongside the Images binding.
 *
 * A missing piece is a named 503: the bridge must never guess a bucket.
 */

function unconfigured(what: string): never {
    throw createError({
        statusCode: 503,
        statusMessage: `${what} is not configured`,
        data: { code: `${what.toUpperCase()}_NOT_CONFIGURED` },
    });
}

export function bridgeS3Config(): R2Config {
    // The Nitro auto-import on purpose: see `readBridgeRequest` — the module-level
    // `runtimeConfig` singleton is backed by `process.env`, which a Worker has not.
    const storage = useRuntimeConfig().fileManager?.storage;
    if (
        !storage?.accountId ||
        !storage.accessKeyId ||
        !storage.secretAccessKey ||
        !storage.bucketName
    ) {
        unconfigured("r2");
    }
    return storage;
}

export function bridgeObjectStorage(): R2StorageProvider {
    return createR2Storage(bridgeS3Config());
}

function cloudflareEnv(event: H3Event<EventHandlerRequest>) {
    const env = event.context.cloudflare?.env;
    if (!env) unconfigured("cloudflare");
    return env;
}

export function bridgeR2Bucket(event: H3Event<EventHandlerRequest>): R2Bucket {
    const bucket = cloudflareEnv(event).CEREMLY_R2;
    if (!bucket) unconfigured("ceremly_r2");
    return bucket;
}

export function bridgeImages(event: H3Event<EventHandlerRequest>): ImagesBinding {
    const images = cloudflareEnv(event).IMAGES;
    if (!images) unconfigured("images_binding");
    return images;
}
