/**
 * File and image-variant rules inside Convex (plan Task 7, spike G08).
 *
 * Pure and dependency-free so both the Convex functions and the hermetic gate can
 * use the same definitions. The values mirror the legacy configuration
 * (`server/utils/runtimeConfig.ts` → `fileManager`) and the legacy key layout
 * (`server/services/file/fileService.ts` → `generateKey`/`getVariantKey`), because
 * the migration must not silently move R2 objects: the bucket, the object keys and
 * the `{basePath}/thumb.webp` / `{basePath}/web.webp` names are unchanged.
 */

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** The MIME types the presign endpoint accepts (legacy `allowedMimeTypes`). */
export const ALLOWED_MIME_TYPES: readonly string[] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
];

/** Types the media bridge can turn into `thumb`/`web` variants. */
export const PROCESSABLE_IMAGE_TYPES: readonly string[] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
];

/** Hard cap on variants per original: the plan's "due varianti al massimo". */
export const VARIANT_LIMIT = 2;

/** Attempts before the pipeline gives up and the state becomes terminal. */
export const MAX_VARIANT_ATTEMPTS = 5;

export interface VariantSpec {
    type: "thumb" | "web";
    /** Target width in px; `withoutEnlargement` keeps smaller images untouched. */
    width: number;
    quality: number;
    format: "webp";
}

export const VARIANT_SPECS: readonly VariantSpec[] = [
    { type: "thumb", width: 400, quality: 80, format: "webp" },
    { type: "web", width: 1600, quality: 85, format: "webp" },
];

export type VariantType = VariantSpec["type"];

export const getFileTypeFromMimeType = (mimeType: string): string => {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("text")) return "text";
    if (mimeType.startsWith("application/")) return "application";
    return "other";
};

export const isProcessableImage = (mimeType: string): boolean =>
    PROCESSABLE_IMAGE_TYPES.includes(mimeType);

/** `yyyy-MM` folder, computed in UTC like the legacy `format(new Date(), "yyyy-MM")`. */
export function monthFolder(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

/**
 * Stable R2 directory of an original.
 *
 * Legacy shape `evt/{eventId}/{yyyy-MM}/{id}` (or `global/{yyyy-MM}/{id}`), kept
 * byte-for-byte so a migrated bucket and a new upload live side by side.
 */
export function buildBasePath(args: { id: string; date?: Date; eventId?: string }): string {
    const prefix = args.eventId ? `evt/${args.eventId}` : "global";
    return `${prefix}/${monthFolder(args.date ?? new Date())}/${args.id}`;
}

/** Extension of an original name, lower-cased, or empty. Never includes the dot. */
export function extensionOf(originalName: string): string {
    const index = originalName.lastIndexOf(".");
    if (index <= 0 || index === originalName.length - 1) return "";
    return originalName.slice(index + 1).toLowerCase();
}

/** Object key of the original inside its base path. */
export const originalKey = (basePath: string, originalName: string): string => {
    const extension = extensionOf(originalName);
    return `${basePath}/original${extension ? `.${extension}` : ""}`;
};

/** Object key of a variant — identical to the legacy `getVariantKey`. */
export const variantKey = (basePath: string, type: VariantType): string =>
    `${basePath}/${type}.webp`;

export type VariantState = "none" | "pending" | "processing" | "ready" | "retrying" | "failed";

export interface VariantTransition {
    status: VariantState;
    attempts: number;
    /** `true` when the pipeline will not be attempted again automatically. */
    terminal: boolean;
}

/**
 * The retry rule, in one place.
 *
 * `processing` is set when the bridge is called; a success is `ready`; a failure
 * either returns to `retrying` (still eligible for the admin retry) or, once
 * `MAX_VARIANT_ATTEMPTS` is reached, becomes the terminal `failed`. Terminal
 * `failed` is what the plan means by "failed terminale visibile": an operator can
 * query it, and nothing retries silently forever.
 */
export function nextVariantState(current: { attempts: number }, outcome: "processing" | "success" | "failure"): VariantTransition {
    if (outcome === "processing") {
        return { status: "processing", attempts: current.attempts, terminal: false };
    }
    if (outcome === "success") {
        return { status: "ready", attempts: current.attempts, terminal: true };
    }

    const attempts = current.attempts + 1;
    return attempts >= MAX_VARIANT_ATTEMPTS
        ? { status: "failed", attempts, terminal: true }
        : { status: "retrying", attempts, terminal: false };
}
