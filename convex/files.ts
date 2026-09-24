import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { forbidden } from "./lib/identity";
import { DOMAIN_WRITE_ROLES, requireRole } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { validateMagicBytes } from "./lib/magicBytes";
import { assertRateLimit } from "./lib/rateLimit";
import { BRIDGE_PATH, callBridge, errorMessage, tryBridge } from "./lib/storageBridge";
import {
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
    VARIANT_SPECS,
    buildBasePath,
    getFileTypeFromMimeType,
    isProcessableImage,
    originalKey,
} from "./lib/media";

/**
 * Files and image variants — Convex domain (plan Task 7, spike G08).
 *
 * The R2 credentials never enter Convex. Every object operation goes through the
 * Worker bridge (`server/api/internal/storage/*`), which holds the S3 keys, limits
 * what it will do, and only trusts a request that carries a valid HMAC over
 * `method/path/timestamp/nonce/body-digest` (see `shared/migration/bridgeProtocol.ts`).
 * The Convex action therefore never sees a presigned URL it could have forged.
 *
 * Status transitions live in *mutations*, not in the actions: "the bytes matched
 * the declared type" and "the file is ready" are the same transaction, so a
 * bridge bug or a crafted object cannot produce a ready file whose content was
 * never validated. The actions are thin orchestrators (fetch + transitions).
 */

// Il client del bridge (`BRIDGE_PATH`, `callBridge`, `tryBridge`, `errorMessage`)
// vive in `lib/storageBridge.ts` dal Task 12: gli export GDPR fanno le stesse
// chiamate, e due copie della firma sarebbero due posti dove può divergere.

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export interface UploadAuthz {
    authUserId: string;
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
    role: "owner" | "admin" | "member";
    /** Legacy `user.role === 'admin'`: the only role that may touch others' files. */
    isGlobalAdmin: boolean;
}

/**
 * Authorization snapshot for every files action.
 *
 * Uploads are a domain write, so the legacy rule applies: **every** member of the
 * organization may upload (removing that would be a silent capability change).
 * Deleting or signing somebody else's private file additionally needs the global
 * admin role, exactly like the legacy route.
 */
export const uploadAuthz = internalQuery({
    args: {},
    handler: async (ctx): Promise<UploadAuthz> => {
        const authz = await requireRole(ctx, DOMAIN_WRITE_ROLES);
        const appUser = await ctx.db.get(authz.appUserId);

        return {
            ...authz,
            isGlobalAdmin: appUser?.globalRole === "superAdmin",
        };
    },
});

/** Tenant check for an event-scoped key (`evt/{eventId}/…`). */
export const assertEventAccess = internalQuery({
    args: { organizationId: v.id("organizations"), eventId: v.id("events") },
    handler: async (ctx, args) => {
        const event = await ctx.db.get(args.eventId);
        if (!event || event.organizationId !== args.organizationId) {
            throw forbidden("EVENT_NOT_FOUND", { eventId: args.eventId });
        }
        return { eventId: event._id };
    },
});

// ---------------------------------------------------------------------------
// Internal reads
// ---------------------------------------------------------------------------

/**
 * Whether a pending row may be confirmed by this caller in this organization.
 *
 * The uploader alone is not enough (Task 14c fix round 1): after an organization
 * switch, or after losing the membership, the same user must not be able to turn
 * a pending upload into an active file of the **previous** tenant. The
 * organization is the caller's active one, resolved by `uploadAuthz`.
 */
function isConfirmableBy(
    file: Doc<"files"> | null,
    args: { appUserId: Id<"appUsers">; organizationId: Id<"organizations"> },
): file is Doc<"files"> {
    return (
        file !== null &&
        file.uploadStatus === "pending" &&
        file.uploadedBy === args.appUserId &&
        file.organizationId === args.organizationId
    );
}

/** The pending row an upload may confirm — only its own, only in its active org, only while pending. */
export const getPendingForConfirm = internalQuery({
    args: { fileId: v.id("files"), appUserId: v.id("appUsers"), organizationId: v.id("organizations") },
    handler: async (ctx, args): Promise<Doc<"files">> => {
        const file = await ctx.db.get(args.fileId);
        if (!isConfirmableBy(file, args)) {
            throw forbidden("PENDING_UPLOAD_NOT_FOUND", { fileId: args.fileId });
        }
        return file;
    },
});

/**
 * The file a caller may read or delete.
 *
 * Wrong tenant → `FILE_NOT_FOUND` (never `FORBIDDEN`): an id from another
 * organization must not be an oracle for its existence.
 */
export const getFileForAccess = internalQuery({
    args: {
        fileId: v.id("files"),
        appUserId: v.id("appUsers"),
        organizationId: v.id("organizations"),
        isGlobalAdmin: v.boolean(),
        /** `remove` allows the uploader or a global admin; `download` only the uploader. */
        allowGlobalAdmin: v.boolean(),
    },
    handler: async (ctx, args): Promise<Doc<"files">> => {
        const file = await ctx.db.get(args.fileId);
        if (!file || file.organizationId !== args.organizationId) {
            throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        }
        if (file.uploadedBy !== args.appUserId && !(args.allowGlobalAdmin && args.isGlobalAdmin)) {
            throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        }
        return file;
    },
});

/** Variants of an original, for delete and for the admin view. */
export const listVariants = internalQuery({
    args: { fileId: v.id("files") },
    handler: async (ctx, args) => await ctx.db
        .query("files")
        .withIndex("by_variant_of", (q) => q.eq("variantOf", args.fileId))
        .collect(),
});

// ---------------------------------------------------------------------------
// Internal writes
// ---------------------------------------------------------------------------

export const insertPendingUpload = internalMutation({
    args: {
        organizationId: v.id("organizations"),
        uploadedBy: v.id("appUsers"),
        authUserId: v.string(),
        originalName: v.string(),
        mimeType: v.string(),
        fileSize: v.number(),
        path: v.string(),
        basePath: v.string(),
        isPublic: v.boolean(),
        presignExpiresAt: v.number(),
        /**
         * Public URL of the object, computed by the storage bridge (the Worker
         * owns the R2 configuration, public base included). Task 14, part c: the
         * avatar and the invite gallery store this URL, so a public upload that
         * did not carry it would be unusable by the page.
         */
        publicUrl: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ fileId: Id<"files"> }> => {
        const now = Date.now();
        const fileId = await ctx.db.insert("files", {
            organizationId: args.organizationId,
            uploadedBy: args.uploadedBy,
            originalName: args.originalName,
            mimeType: args.mimeType,
            fileType: getFileTypeFromMimeType(args.mimeType),
            size: args.fileSize,
            path: args.path,
            basePath: args.basePath,
            // A private file never carries an unsigned URL: its only way out is
            // `downloadUrl`, which signs after the access check.
            url: args.isPublic && args.publicUrl ? args.publicUrl : null,
            isPublic: args.isPublic,
            isActive: false,
            uploadStatus: "pending",
            presignExpiresAt: args.presignExpiresAt,
            variantType: "original",
            // The row does not know whether the bytes will be an image yet; it
            // knows only that no variant work has been scheduled.
            variantStatus: "none",
            variantAttempts: 0,
            createdAt: now,
            updatedAt: now,
        });

        await writeAudit(ctx, {
            action: "file.presign_requested",
            actorAppUserId: args.uploadedBy,
            actorAuthUserId: args.authUserId,
            organizationId: args.organizationId,
            targetType: "file",
            targetId: fileId,
            details: {
                originalName: args.originalName,
                path: args.path,
                mimeType: args.mimeType,
                size: args.fileSize,
            },
        });

        return { fileId };
    },
});

export type FinalizeResult =
    | { status: "active"; fileId: Id<"files">; variantStatus: "pending" | "none"; url: string | null }
    | { status: "deduplicated"; fileId: Id<"files">; duplicateId: Id<"files">; url: string | null }
    | { status: "failed"; fileId: Id<"files">; reason: string };

/**
 * Turns a pending upload into an active file — the only place a file becomes
 * `active`.
 *
 * Three guards, all in one transaction:
 * 1. **magic bytes** are re-validated here (`headBytes`, base64 of the first
 *    bytes the bridge read). The bridge already read them, but the decision is
 *    what must not be forgeable, and doing it in the mutation makes "checked" and
 *    "ready" atomic.
 * 2. **dedup** by `sha256 + organizationId`: a duplicate marks this row failed
 *    and reports the surviving file; the action then deletes the orphan object.
 * 3. **variant scheduling**: an image becomes `pending` (the media bridge will
 *    move it on), anything else stays `none` — never `ready`, which would claim
 *    variants that were never produced.
 */
export const finalizeUpload = internalMutation({
    args: {
        fileId: v.id("files"),
        organizationId: v.id("organizations"),
        appUserId: v.id("appUsers"),
        authUserId: v.string(),
        headBytes: v.string(),
        sha256: v.string(),
        size: v.number(),
    },
    handler: async (ctx, args): Promise<FinalizeResult> => {
        const file = await ctx.db.get(args.fileId);
        // Re-checked here, not only in the action's read: the transition is what
        // must not be reachable for the wrong tenant.
        if (!isConfirmableBy(file, args)) {
            throw forbidden("PENDING_UPLOAD_NOT_FOUND", { fileId: args.fileId });
        }

        // The presigned PUT binds the Content-Type, not the length: the size
        // checked at presign is only what the caller *declared*. The stored object
        // must be exactly that size and within the cap (Task 14c fix round 1).
        const sizeProblem =
            args.size > MAX_FILE_SIZE_BYTES
                ? "file_too_large"
                : args.size !== file.size
                  ? "size_mismatch"
                  : null;
        if (sizeProblem) {
            await ctx.db.patch(file._id, {
                uploadStatus: "failed",
                isActive: false,
                updatedAt: Date.now(),
            });
            await writeAudit(ctx, {
                action: "file.upload_rejected",
                actorAppUserId: args.appUserId,
                actorAuthUserId: args.authUserId,
                organizationId: file.organizationId,
                targetType: "file",
                targetId: file._id,
                details: {
                    reason: sizeProblem,
                    declaredSize: file.size,
                    actualSize: args.size,
                    max: MAX_FILE_SIZE_BYTES,
                },
            });
            return { status: "failed", fileId: file._id, reason: sizeProblem };
        }

        const head = decodeBase64(args.headBytes, 256);
        if (!validateMagicBytes(head, file.mimeType)) {
            await ctx.db.patch(file._id, {
                uploadStatus: "failed",
                isActive: false,
                updatedAt: Date.now(),
            });
            return { status: "failed", fileId: file._id, reason: "magic_bytes_mismatch" };
        }

        const duplicate = await ctx.db
            .query("files")
            .withIndex("by_org_sha256", (q) =>
                q.eq("organizationId", file.organizationId).eq("sha256", args.sha256),
            )
            .collect()
            .then((candidates) =>
                candidates.find(
                    (candidate) =>
                        candidate._id !== file._id &&
                        candidate.uploadStatus === "active" &&
                        candidate.variantType === "original" &&
                        // Never across visibility (Task 14c fix round 1): a public
                        // upload must not be deleted in favor of a private file
                        // (it would have no URL), and a private one must not
                        // inherit a public file's unsigned URL.
                        candidate.isPublic === file.isPublic,
                ) ?? null,
            );

        if (duplicate) {
            await ctx.db.patch(file._id, {
                uploadStatus: "failed",
                sha256: args.sha256,
                updatedAt: Date.now(),
            });
            await writeAudit(ctx, {
                action: "file.dedup_matched",
                actorAppUserId: args.appUserId,
                actorAuthUserId: args.authUserId,
                organizationId: file.organizationId,
                targetType: "file",
                targetId: duplicate._id,
                details: { sha256: args.sha256, existingFileId: duplicate._id, duplicateRowId: file._id },
            });
            // The survivor's URL: this row's object is deleted by the action.
            return {
                status: "deduplicated",
                fileId: file._id,
                duplicateId: duplicate._id,
                url: duplicate.url ?? null,
            };
        }

        const variantStatus = isProcessableImage(file.mimeType) ? "pending" : "none";

        await ctx.db.patch(file._id, {
            uploadStatus: "active",
            isActive: true,
            sha256: args.sha256,
            size: args.size,
            variantStatus,
            variantAttempts: 0,
            variantUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        await writeAudit(ctx, {
            action: "file.upload_confirmed",
            actorAppUserId: args.appUserId,
            actorAuthUserId: args.authUserId,
            organizationId: file.organizationId,
            targetType: "file",
            targetId: file._id,
            details: { originalName: file.originalName, path: file.path, sha256: args.sha256 },
        });
        await writeAudit(ctx, {
            action: "file.uploaded",
            actorAppUserId: args.appUserId,
            actorAuthUserId: args.authUserId,
            organizationId: file.organizationId,
            targetType: "file",
            targetId: file._id,
            details: { originalName: file.originalName, mimeType: file.mimeType, size: args.size },
        });

        return { status: "active", fileId: file._id, variantStatus, url: file.url ?? null };
    },
});

export const markUploadFailed = internalMutation({
    args: { fileId: v.id("files"), reason: v.string() },
    handler: async (ctx, args) => {
        const file = await ctx.db.get(args.fileId);
        if (!file) return { updated: false };
        await ctx.db.patch(file._id, {
            uploadStatus: "failed",
            isActive: false,
            updatedAt: Date.now(),
        });
        return { updated: true };
    },
});

/** Deletes a row (and its variants) after the objects are gone from R2. */
export const deleteWithVariants = internalMutation({
    args: {
        fileId: v.id("files"),
        authUserId: v.string(),
        actorAppUserId: v.id("appUsers"),
    },
    handler: async (ctx, args): Promise<{ deletedVariants: number }> => {
        const file = await ctx.db.get(args.fileId);
        if (!file) throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });

        const variants = await ctx.db
            .query("files")
            .withIndex("by_variant_of", (q) => q.eq("variantOf", file._id))
            .collect();

        for (const variant of variants) {
            await ctx.db.delete(variant._id);
        }
        await ctx.db.delete(file._id);

        await writeAudit(ctx, {
            action: "file.deleted",
            actorAppUserId: args.actorAppUserId,
            actorAuthUserId: args.authUserId,
            organizationId: file.organizationId,
            targetType: "file",
            targetId: file._id,
            details: { originalName: file.originalName, variantsDeleted: variants.length },
        });

        return { deletedVariants: variants.length };
    },
});

// ---------------------------------------------------------------------------
// Bridge payloads
// ---------------------------------------------------------------------------

function decodeBase64(value: string, maxBytes: number): Uint8Array {
    const binary = atob(value);
    const length = Math.min(binary.length, maxBytes);
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

// ---------------------------------------------------------------------------
// Public actions (the thin API)
// ---------------------------------------------------------------------------

export interface PresignResult {
    fileId: Id<"files">;
    presignedUrl: string;
    key: string;
    expiresAt: number;
    basePath: string;
}

export const presignUpload = action({
    args: {
        originalName: v.string(),
        mimeType: v.string(),
        fileSize: v.number(),
        eventId: v.optional(v.id("events")),
        isPublic: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<PresignResult> => {
        // Authorization first: an unauthorized caller must learn nothing about
        // the storage bridge or the limits.
        const authz: UploadAuthz = await ctx.runQuery(internal.files.uploadAuthz, {});

        if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) {
            throw forbidden("FILE_SIZE_INVALID", { fileSize: args.fileSize });
        }
        if (args.fileSize > MAX_FILE_SIZE_BYTES) {
            throw forbidden("FILE_TOO_LARGE", { max: MAX_FILE_SIZE_BYTES, fileSize: args.fileSize });
        }
        if (!ALLOWED_MIME_TYPES.includes(args.mimeType)) {
            throw forbidden("FILE_TYPE_NOT_ALLOWED", { mimeType: args.mimeType });
        }

        // Budget check after authorization and the cheap validation, before the
        // bridge call: a presign mints a URL against the real bucket, so it is the
        // expensive step to protect. Keyed by the *caller*, not by the file, so
        // creating more rows cannot buy more budget. Plan Task 8 (`filePresign`).
        await assertRateLimit(ctx, {
            bucket: "filePresign",
            key: `${authz.appUserId}:${authz.organizationId}`,
        });

        if (args.eventId) {
            await ctx.runQuery(internal.files.assertEventAccess, {
                organizationId: authz.organizationId,
                eventId: args.eventId,
            });
        }

        const id = crypto.randomUUID();
        const basePath = buildBasePath({ id, eventId: args.eventId });
        const key = originalKey(basePath, args.originalName);

        const presign = await callBridge<{ url: string; key: string; expiresAt: number; publicUrl?: string }>(
            BRIDGE_PATH.presign,
            {
                key,
                mimeType: args.mimeType,
                fileSize: args.fileSize,
                organizationId: authz.organizationId,
            },
        );

        const inserted: { fileId: Id<"files"> } = await ctx.runMutation(
            internal.files.insertPendingUpload,
            {
                organizationId: authz.organizationId,
                uploadedBy: authz.appUserId,
                authUserId: authz.authUserId,
                originalName: args.originalName,
                mimeType: args.mimeType,
                fileSize: args.fileSize,
                path: key,
                basePath,
                isPublic: args.isPublic ?? true,
                presignExpiresAt: presign.expiresAt,
                ...(typeof presign.publicUrl === "string" && { publicUrl: presign.publicUrl }),
            },
        );

        return {
            fileId: inserted.fileId,
            presignedUrl: presign.url,
            key,
            expiresAt: presign.expiresAt,
            basePath,
        };
    },
});

export interface ConfirmResult {
    fileId: Id<"files">;
    deduplicated: boolean;
    variantStatus: "pending" | "processing" | "none" | "retrying";
    /** Public URL of the surviving file (`null` for a private one). Task 14, part c. */
    url: string | null;
}

export const confirmUpload = action({
    args: { fileId: v.id("files") },
    handler: async (ctx, args): Promise<ConfirmResult> => {
        const authz: UploadAuthz = await ctx.runQuery(internal.files.uploadAuthz, {});

        // Confirm is what reads the object and can start variant work, so it has
        // its own (looser) budget: an attacker cannot mint presigns past the
        // limit, but a legitimate multi-file picker still confirms in a burst.
        await assertRateLimit(ctx, {
            bucket: "fileConfirm",
            key: `${authz.appUserId}:${authz.organizationId}`,
        });

        const pending: Doc<"files"> = await ctx.runQuery(internal.files.getPendingForConfirm, {
            fileId: args.fileId,
            appUserId: authz.appUserId,
            organizationId: authz.organizationId,
        });

        // One bridge call reads everything the transition needs: existence, the
        // content digest and the first bytes for the magic-bytes check. The bytes
        // never come back in full, so a 5 MB upload does not become a 7 MB body.
        const inspect = await callBridge<{
            exists: boolean;
            size: number;
            sha256: string;
            headBytes: string;
        }>(BRIDGE_PATH.object, { op: "inspect", key: pending.path });

        if (!inspect.exists) {
            await ctx.runMutation(internal.files.markUploadFailed, {
                fileId: args.fileId,
                reason: "object_missing",
            });
            throw forbidden("UPLOAD_OBJECT_MISSING", { fileId: args.fileId });
        }

        const finalized: FinalizeResult = await ctx.runMutation(internal.files.finalizeUpload, {
            fileId: args.fileId,
            organizationId: authz.organizationId,
            appUserId: authz.appUserId,
            authUserId: authz.authUserId,
            headBytes: inspect.headBytes,
            sha256: inspect.sha256,
            size: inspect.size,
        });

        if (finalized.status === "failed") {
            await tryBridge(BRIDGE_PATH.object, { op: "delete", key: pending.path });
            if (finalized.reason === "size_mismatch") {
                throw forbidden("UPLOAD_SIZE_MISMATCH", { fileId: args.fileId });
            }
            if (finalized.reason === "file_too_large") {
                throw forbidden("FILE_TOO_LARGE", { fileId: args.fileId, max: MAX_FILE_SIZE_BYTES });
            }
            throw forbidden("MAGIC_BYTES_MISMATCH", { fileId: args.fileId });
        }

        if (finalized.status === "deduplicated") {
            await tryBridge(BRIDGE_PATH.object, { op: "delete", key: pending.path });
            return {
                fileId: finalized.duplicateId,
                deduplicated: true,
                variantStatus: "none",
                url: finalized.url,
            };
        }

        if (finalized.variantStatus !== "pending") {
            return { fileId: finalized.fileId, deduplicated: false, variantStatus: "none", url: finalized.url };
        }

        // Stessa action del job `image-variant` (Task 13): il percorso immediato e il
        // recupero del cron non possono divergere se sono lo stesso codice.
        const processed: { status: VariantProcessingStatus } = await ctx.runAction(
            internal.files.processVariants,
            { fileId: args.fileId },
        );

        return {
            fileId: finalized.fileId,
            deduplicated: false,
            variantStatus: processed.status,
            url: finalized.url,
        };
    },
});

export type VariantProcessingStatus = "pending" | "processing" | "none" | "retrying";

/**
 * Avvia la generazione delle varianti di un originale (plan Task 13).
 *
 * Estratta dal percorso di `confirmUpload` perché il job `image-variant` — quello
 * che il cron usa per recuperare gli upload i cui job sono andati persi — deve fare
 * **esattamente** la stessa cosa. Due copie di questa sequenza sarebbero due posti
 * dove la regola di retry può divergere, e la divergenza si vedrebbe solo sui file
 * recuperati.
 *
 * `none` significa "niente da fare" (non è un'immagine, o è già in lavorazione):
 * non è un errore e non deve far ritentare un job.
 */
export const processVariants = internalAction({
    args: { fileId: v.id("files") },
    handler: async (ctx, args): Promise<{ status: VariantProcessingStatus }> => {
        const started: {
            shouldProcess: boolean;
            path: string;
            basePath: string;
            mimeType: string;
            organizationId: Id<"organizations">;
        } = await ctx.runMutation(internal.media.startProcessing, { fileId: args.fileId });

        if (!started.shouldProcess) return { status: "none" };

        try {
            await callBridge(BRIDGE_PATH.media, {
                fileId: args.fileId,
                key: started.path,
                basePath: started.basePath,
                mimeType: started.mimeType,
                organizationId: started.organizationId,
                variants: VARIANT_SPECS,
            });
            return { status: "processing" };
        } catch (error) {
            // The Worker could not process: record the attempt and let the retry
            // rule decide between `retrying` and the terminal `failed`.
            await ctx.runMutation(internal.media.recordProcessingFailure, {
                fileId: args.fileId,
                error: errorMessage(error),
            });
            return { status: "retrying" };
        }
    },
});

// ---------------------------------------------------------------------------
// Orphan cleanup (plan Task 13, Step 4)
// ---------------------------------------------------------------------------

/**
 * Rivendica un lotto di upload mai confermati, restituendo ciò che serve a
 * cancellarne gli oggetti.
 *
 * Il claim è un **lease su `presignExpiresAt`**, non uno stato nuovo. Il legacy
 * marcava la riga `cleaning` prima di cancellare l'oggetto: se il processo moriva in
 * mezzo, la riga restava `cleaning` per sempre e l'oggetto non veniva più ripulito da
 * nessuno. Spostare avanti la scadenza produce lo stesso effetto immediato (la riga
 * non è più candidata) senza perdere la riga quando qualcosa va storto: il lease
 * scade e il giro successivo riprova.
 */
export const claimOrphanFiles = internalMutation({
    args: { limit: v.optional(v.number()), graceHours: v.optional(v.number()) },
    handler: async (
        ctx,
        args,
    ): Promise<Array<{ fileId: Id<"files">; path: string; leaseAt: number }>> => {
        const limit = args.limit ?? 50;
        const graceMs = (args.graceHours ?? 1) * 60 * 60 * 1000;
        const now = Date.now();
        const cutoff = now - graceMs;

        // Intervallo indicizzato esatto, non `take` + filtro: la condizione è quella
        // del cron, e `by_upload_status` la copre per intero.
        const candidates = await ctx.db
            .query("files")
            .withIndex("by_upload_status", (q) =>
                q.eq("uploadStatus", "pending").lt("presignExpiresAt", cutoff),
            )
            .take(limit);

        const claimed: Array<{ fileId: Id<"files">; path: string; leaseAt: number }> = [];

        for (const file of candidates) {
            // Il filtro resta anche se l'indice dovrebbe già averlo applicato, ed è
            // la lezione del Task 12: `dueAccounts` si fidava della semantica di un
            // range su un campo opzionale e cancellava account appena creati. Una
            // query che cancella non deve dipendere da quale dei due comportamenti
            // dell'indice vale: `undefined` non è una scadenza, quindi non si rivendica.
            if (file.presignExpiresAt === undefined || file.presignExpiresAt >= cutoff) continue;

            await ctx.db.patch(file._id, { presignExpiresAt: now, updatedAt: now });
            claimed.push({ fileId: file._id, path: file.path, leaseAt: now });
        }

        return claimed;
    },
});

/**
 * Cancella la riga di un orfano il cui oggetto è sparito davvero.
 *
 * Il `leaseAt` è il testimone del lease: se nel frattempo la riga è stata toccata
 * (qualcuno l'ha confermata, o un altro giro l'ha rivendicata) la cancellazione non
 * avviene — "questa riga è mia" deve essere verificabile, non supposto.
 */
export const purgeOrphanFile = internalMutation({
    args: { fileId: v.id("files"), leaseAt: v.number() },
    handler: async (ctx, args): Promise<{ deleted: boolean }> => {
        const file = await ctx.db.get(args.fileId);
        if (!file) return { deleted: false };
        if (file.uploadStatus !== "pending" || file.presignExpiresAt !== args.leaseAt) {
            return { deleted: false };
        }

        await ctx.db.delete(file._id);
        return { deleted: true };
    },
});

/** Rilascia il lease rendendo la riga candidabile subito al giro successivo. */
export const releaseOrphanFile = internalMutation({
    args: { fileId: v.id("files"), leaseAt: v.number() },
    handler: async (ctx, args): Promise<void> => {
        const file = await ctx.db.get(args.fileId);
        if (!file) return;
        if (file.uploadStatus !== "pending" || file.presignExpiresAt !== args.leaseAt) return;

        // `0` e non `leaseAt - 1`: la ri-ammissione è "scaduto da sempre". Un oggetto
        // che non si riesce a cancellare deve tornare **in testa** alla coda, non
        // aspettare un'altra grace period per ogni fallimento — altrimenti un guasto
        // di R2 rallenta la pulizia di un fattore pari alla grace stessa. Il lease
        // serve solo a impedire che due giri si sovrappongano, ed è già stato speso.
        await ctx.db.patch(file._id, { presignExpiresAt: 0, updatedAt: Date.now() });
    },
});

export const downloadUrl = action({
    args: { fileId: v.id("files") },
    handler: async (ctx, args): Promise<{ url: string; expiresAt: number | null }> => {
        const authz: UploadAuthz = await ctx.runQuery(internal.files.uploadAuthz, {});
        const file: Doc<"files"> = await ctx.runQuery(internal.files.getFileForAccess, {
            fileId: args.fileId,
            appUserId: authz.appUserId,
            organizationId: authz.organizationId,
            isGlobalAdmin: authz.isGlobalAdmin,
            allowGlobalAdmin: false,
        });

        if (file.isPublic && file.url) {
            return { url: file.url, expiresAt: null };
        }

        const signed = await callBridge<{ url: string; expiresAt: number }>(BRIDGE_PATH.object, {
            op: "sign-download",
            key: file.path,
            expiresInSeconds: 300,
        });

        return { url: signed.url, expiresAt: signed.expiresAt };
    },
});

export const remove = action({
    args: { fileId: v.id("files") },
    handler: async (ctx, args): Promise<{ deleted: boolean; deletedVariants: number }> => {
        const authz: UploadAuthz = await ctx.runQuery(internal.files.uploadAuthz, {});
        const file: Doc<"files"> = await ctx.runQuery(internal.files.getFileForAccess, {
            fileId: args.fileId,
            appUserId: authz.appUserId,
            organizationId: authz.organizationId,
            isGlobalAdmin: authz.isGlobalAdmin,
            allowGlobalAdmin: true,
        });

        const variants: Doc<"files">[] = await ctx.runQuery(internal.files.listVariants, {
            fileId: file._id,
        });

        for (const variant of variants) {
            await tryBridge(BRIDGE_PATH.object, { op: "delete", key: variant.path });
        }
        await tryBridge(BRIDGE_PATH.object, { op: "delete", key: file.path });

        const result: { deletedVariants: number } = await ctx.runMutation(
            internal.files.deleteWithVariants,
            {
                fileId: file._id,
                authUserId: authz.authUserId,
                actorAppUserId: authz.appUserId,
            },
        );

        return { deleted: true, deletedVariants: result.deletedVariants };
    },
});
