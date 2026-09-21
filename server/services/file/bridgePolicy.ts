/**
 * The slice of `fileManager` the bridge enforces. Passed in explicitly so the
 * policy stays pure and testable: the handlers read it from
 * `useRuntimeConfig(event)` at the boundary.
 */
export interface BridgeFilePolicy {
    maxFileSize?: number;
    allowedMimeTypes?: string[];
}

/**
 * What the storage/media bridge will and will not do (plan Task 7, Step 3).
 *
 * The Worker holds the R2 credentials, so "the request was signed" is not enough:
 * a compromised or buggy Convex action could still ask it to sign an object
 * outside our namespace, or to touch a key belonging to another tenant. These are
 * the limits the bridge enforces *in addition* to the HMAC.
 *
 * Size and MIME policy come from the app's own `fileManager` runtime config — the
 * same values the legacy `/api/file/*` routes enforced — so the bridge cannot
 * drift from the application.
 *
 * That config reaches the handlers through `useRuntimeConfig(event)`, never
 * through the module-level `runtimeConfig` singleton: on the built Worker the
 * singleton resolves through its `process.env` fallback, which is empty there
 * (measured in Task 7 — the bridge secret came back undefined even though it was
 * baked into the bundle).
 */

/**
 * The legacy key layout, narrowed to a shape a value cannot escape.
 *
 * `evt/{eventId}/{yyyy-MM}/{id}/original.ext` or `global/{yyyy-MM}/{id}/original.ext`.
 * Deliberately anchored: no `..`, no leading slash, no query characters.
 */
export const STORAGE_KEY_PATTERN =
    /^(?:evt\/[A-Za-z0-9_-]{1,64}|global)\/\d{4}-\d{2}\/[A-Za-z0-9_-]{1,64}\/original(?:\.[a-z0-9]{1,8})?$/;

/** Expiry the bridge itself imposes on a presigned upload (15 minutes). */
export const PRESIGN_EXPIRES_SECONDS = 900;

/** Expiry the bridge imposes on a signed download (5 minutes). */
export const DOWNLOAD_EXPIRES_SECONDS = 300;

/** MIME types the media bridge can transform. */
export const PROCESSABLE_BRIDGE_TYPES: readonly string[] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
];

export const objectKeyPattern = /^(?:evt\/[A-Za-z0-9_-]{1,64}|global)\/\d{4}-\d{2}\/[A-Za-z0-9_-]{1,64}\/(?:original(?:\.[a-z0-9]{1,8})?|thumb\.webp|web\.webp)$/;

function fail(statusCode: number, statusMessage: string, code: string): never {
    throw createError({ statusCode, statusMessage, data: { code } });
}

/** Rejects any key outside the storage namespace before it reaches aws4fetch. */
export function assertStorageKey(key: unknown, allowVariants = false): string {
    if (typeof key !== "string" || key.length === 0 || key.length > 512) {
        fail(400, "Invalid storage key", "BRIDGE_KEY_INVALID");
    }
    const pattern = allowVariants ? objectKeyPattern : STORAGE_KEY_PATTERN;
    if (!pattern.test(key)) {
        fail(400, "Storage key outside the allowed namespace", "BRIDGE_KEY_NOT_ALLOWED");
    }
    return key;
}

export function assertAllowedMimeType(policy: BridgeFilePolicy, mimeType: unknown): string {
    const allowed = policy.allowedMimeTypes ?? [];
    if (typeof mimeType !== "string" || !allowed.includes(mimeType)) {
        fail(415, "File type not allowed", "BRIDGE_MIME_NOT_ALLOWED");
    }
    return mimeType;
}

export function assertProcessableMimeType(mimeType: unknown): string {
    if (typeof mimeType !== "string" || !PROCESSABLE_BRIDGE_TYPES.includes(mimeType)) {
        fail(415, "Media type cannot be processed", "BRIDGE_MIME_NOT_PROCESSABLE");
    }
    return mimeType;
}

export function assertAllowedFileSize(policy: BridgeFilePolicy, fileSize: unknown): number {
    const max = policy.maxFileSize ?? 5 * 1024 * 1024;
    if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) {
        fail(400, "Invalid file size", "BRIDGE_SIZE_INVALID");
    }
    if (fileSize > max) {
        fail(413, "File size exceeds the allowed maximum", "BRIDGE_SIZE_TOO_LARGE");
    }
    return fileSize;
}

export function assertBasePath(basePath: unknown): string {
    if (typeof basePath !== "string" || !/^(?:evt\/[A-Za-z0-9_-]{1,64}|global)\/\d{4}-\d{2}\/[A-Za-z0-9_-]{1,64}$/.test(basePath)) {
        fail(400, "Invalid media base path", "BRIDGE_BASE_PATH_INVALID");
    }
    return basePath;
}

/** Same derivation as the legacy `getVariantKey` and `convex/lib/media.ts`. */
export const bridgeVariantKey = (basePath: string, type: "thumb" | "web"): string =>
    `${basePath}/${type}.webp`;
