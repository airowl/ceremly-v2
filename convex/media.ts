import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { forbidden } from "./lib/identity";
import { writeAudit } from "./lib/audit";
import {
    MAX_VARIANT_ATTEMPTS,
    VARIANT_LIMIT,
    isProcessableImage,
    nextVariantState,
    variantKey,
    type VariantType,
} from "./lib/media";

/**
 * Image-variant pipeline (plan Task 7, Step 3).
 *
 * The Worker does the pixels (Cloudflare Images binding) and reports back through
 * `internal.media.processVariantResult`. All state lives here, so the pipeline is
 * observable: `pending → processing → ready | retrying → failed`, with the attempt
 * count and the last error on the row itself. Nothing retries silently forever and
 * a failure is never reported as an empty variant list.
 *
 * Idempotency is by `(variantOf, variantType)`, not by the callback's identity: a
 * redelivered callback finds the rows and updates them instead of inserting a
 * second `thumb`.
 */

const variantInput = v.object({
    type: v.union(v.literal("thumb"), v.literal("web")),
    key: v.string(),
    size: v.number(),
    sha256: v.optional(v.string()),
});

export const startProcessing = internalMutation({
    args: { fileId: v.id("files") },
    handler: async (
        ctx,
        args,
    ): Promise<{
        shouldProcess: boolean;
        path: string;
        basePath: string;
        mimeType: string;
        organizationId: Id<"organizations">;
    }> => {
        const file = await ctx.db.get(args.fileId);
        if (!file || file.variantType !== "original") {
            throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        }

        // Only an original waiting for work may start. A file already `ready`,
        // `none` (not an image) or `processing` must not be handed to the bridge
        // twice, which is what makes the caller's retry safe to reason about.
        if (file.variantStatus !== "pending" && file.variantStatus !== "retrying") {
            return {
                shouldProcess: false,
                path: file.path,
                basePath: file.basePath,
                mimeType: file.mimeType,
                // Task 13: il chiamante unico (job `image-variant`) non ha una
                // sessione da cui leggere il tenant, e il bridge vuole
                // l'organizzazione nel payload firmato. Restituirla qui tiene la
                // decisione dove sta l'ownership: sulla riga del file.
                organizationId: file.organizationId,
            };
        }

        await ctx.db.patch(file._id, {
            variantStatus: "processing",
            variantUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        // `path` (not just `basePath`) travels with the payload: the original's
        // extension comes from the uploaded name, so re-deriving it in the Worker
        // from the MIME type would guess wrong for `.jpeg`/`.jpe` uploads.
        return {
            shouldProcess: true,
            path: file.path,
            basePath: file.basePath,
            mimeType: file.mimeType,
            organizationId: file.organizationId,
        };
    },
});

/**
 * Originali immagine che aspettano ancora le varianti (plan Task 13, Step 4).
 *
 * È la query del cron `requeue-image-variants`: nel legacy era
 * `is_active AND variant_type='original' AND variants_generated_at IS NULL AND
 * mime LIKE 'image/%'`. In Convex lo stato è esplicito (`pending` | `retrying`),
 * quindi non serve un campo "generated_at": un originale pronto è `ready` e uno che
 * non è un'immagine è `none`, e nessuno dei due compare qui.
 *
 * `take(limit * 4)` prima del filtro è un compromesso dichiarato: filtrare dopo il
 * taglio può perdere candidati, ma i documenti letti in più non costano una
 * scansione e il cron gira ogni ora. L'alternativa — un indice che includa
 * `variantType` **e** il MIME — sarebbe un indice per un predicato che il bridge
 * rivalida comunque.
 */
export const variantsNeedingWork = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<Array<Id<"files">>> => {
        const limit = args.limit ?? 25;
        const ids: Array<Id<"files">> = [];

        for (const status of ["pending", "retrying"] as const) {
            const rows = await ctx.db
                .query("files")
                .withIndex("by_variant_status", (q) => q.eq("variantStatus", status))
                .take(limit * 4);

            for (const row of rows) {
                if (!row.isActive) continue;
                if (row.variantType !== "original") continue;
                if (!isProcessableImage(row.mimeType)) continue;

                ids.push(row._id);
                if (ids.length >= limit) return ids;
            }
        }

        return ids;
    },
});

/**
 * The bridge's result callback.
 *
 * `ok: false` is a first-class outcome, not an exception: the Worker reports the
 * provider error it saw, and the retry rule here decides between `retrying` and
 * the terminal `failed`. A callback that claims success with zero or too many
 * variants is rejected — the plan's "due varianti al massimo" is enforced where
 * the rows are written, not only in the Worker.
 */
export const processVariantResult = internalMutation({
    args: {
        fileId: v.id("files"),
        ok: v.boolean(),
        variants: v.optional(v.array(variantInput)),
        error: v.optional(v.string()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ status: Doc<"files">["variantStatus"]; inserted: number; updated: number }> => {
        const file = await ctx.db.get(args.fileId);
        if (!file) throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        if (file.variantType !== "original") {
            throw forbidden("NOT_AN_ORIGINAL", { fileId: args.fileId });
        }

        // A redelivered success callback is a no-op: the rows and the status are
        // already what it would write.
        if (file.variantStatus === "ready" && args.ok) {
            return { status: "ready", inserted: 0, updated: 0 };
        }

        if (!args.ok) {
            const transition = nextVariantState({ attempts: file.variantAttempts }, "failure");
            await ctx.db.patch(file._id, {
                variantStatus: transition.status,
                variantAttempts: transition.attempts,
                variantError: args.error ?? "variant_processing_failed",
                variantUpdatedAt: Date.now(),
                updatedAt: Date.now(),
            });

            if (transition.status === "failed") {
                await writeAudit(ctx, {
                    action: "file.variant_failed",
                    organizationId: file.organizationId,
                    targetType: "file",
                    targetId: file._id,
                    status: "failure",
                    details: { attempts: transition.attempts, error: args.error ?? null, terminal: true },
                });
            }

            return { status: transition.status, inserted: 0, updated: 0 };
        }

        const variants = args.variants ?? [];
        if (variants.length === 0 || variants.length > VARIANT_LIMIT) {
            throw forbidden("VARIANT_COUNT_INVALID", {
                received: variants.length,
                limit: VARIANT_LIMIT,
            });
        }

        const existing = await ctx.db
            .query("files")
            .withIndex("by_variant_of", (q) => q.eq("variantOf", file._id))
            .collect();

        const now = Date.now();
        let inserted = 0;
        let updated = 0;

        for (const variant of variants) {
            const expectedKey = variantKey(file.basePath, variant.type as VariantType);
            const previous = existing.find((row) => row.variantType === variant.type);

            if (previous) {
                await ctx.db.patch(previous._id, {
                    path: variant.key,
                    size: variant.size,
                    sha256: variant.sha256,
                    variantError: undefined,
                    variantUpdatedAt: now,
                    updatedAt: now,
                });
                updated += 1;
                continue;
            }

            // The key is derived, not trusted: a callback that points a variant at
            // a different object would otherwise be able to write an arbitrary key
            // into the tenant's variant list.
            if (variant.key !== expectedKey) {
                throw forbidden("VARIANT_KEY_MISMATCH", {
                    type: variant.type,
                    expected: expectedKey,
                    received: variant.key,
                });
            }

            await ctx.db.insert("files", {
                organizationId: file.organizationId,
                uploadedBy: file.uploadedBy,
                originalName: `${variant.type}.webp`,
                mimeType: "image/webp",
                fileType: "image",
                size: variant.size,
                path: variant.key,
                basePath: file.basePath,
                url: file.url,
                isPublic: file.isPublic,
                isActive: true,
                uploadStatus: "active",
                sha256: variant.sha256,
                variantOf: file._id,
                variantType: variant.type,
                variantStatus: "none",
                variantAttempts: 0,
                createdAt: now,
                updatedAt: now,
            });
            inserted += 1;
        }

        const transition = nextVariantState({ attempts: file.variantAttempts }, "success");
        await ctx.db.patch(file._id, {
            variantStatus: transition.status,
            variantError: undefined,
            variantUpdatedAt: now,
            updatedAt: now,
        });

        await writeAudit(ctx, {
            action: "file.variant_ready",
            organizationId: file.organizationId,
            targetType: "file",
            targetId: file._id,
            details: { inserted, updated, variants: variants.map((variant) => variant.type) },
        });

        return { status: transition.status, inserted, updated };
    },
});

/**
 * Records a failure that never reached the callback (the bridge call itself threw
 * or returned non-2xx). Same retry rule as a reported failure, so the attempt
 * count cannot be bypassed by failing earlier.
 */
export const recordProcessingFailure = internalMutation({
    args: { fileId: v.id("files"), error: v.string() },
    handler: async (ctx, args): Promise<{ status: Doc<"files">["variantStatus"]; attempts: number }> => {
        const file = await ctx.db.get(args.fileId);
        if (!file || file.variantType !== "original") {
            throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        }

        const transition = nextVariantState({ attempts: file.variantAttempts }, "failure");
        await ctx.db.patch(file._id, {
            variantStatus: transition.status,
            variantAttempts: transition.attempts,
            variantError: args.error,
            variantUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        if (transition.status === "failed") {
            await writeAudit(ctx, {
                action: "file.variant_failed",
                organizationId: file.organizationId,
                targetType: "file",
                targetId: file._id,
                status: "failure",
                details: { attempts: transition.attempts, error: args.error, terminal: true },
            });
        }

        return { status: transition.status, attempts: transition.attempts };
    },
});

/**
 * Manual retry (the plan's "retry manuale da funzione admin").
 *
 * Moves a `retrying` or terminal `failed` original back to `pending` and returns
 * the payload the caller needs to call the bridge again. Attempts are preserved:
 * the manual retry gives one more shot, it does not reset the budget.
 */
export const retryVariant = internalMutation({
    args: { fileId: v.id("files") },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { retried: false; reason: string }
        | {
              retried: true;
              path: string;
              basePath: string;
              mimeType: string;
              organizationId: Id<"organizations">;
          }
    > => {
        const file = await ctx.db.get(args.fileId);
        if (!file || file.variantType !== "original") {
            throw forbidden("FILE_NOT_FOUND", { fileId: args.fileId });
        }

        if (file.variantStatus !== "retrying" && file.variantStatus !== "failed") {
            return { retried: false, reason: `status_${file.variantStatus}` };
        }

        await ctx.db.patch(file._id, {
            variantStatus: "pending",
            variantUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        return {
            retried: true,
            path: file.path,
            basePath: file.basePath,
            mimeType: file.mimeType,
            organizationId: file.organizationId,
        };
    },
});

/** Observability: originals whose variants are not ready. */
export const variantsNeedingAttention = internalQuery({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("files")
            .withIndex("by_variant_status")
            .collect();

        return rows
            .filter((row) => row.variantStatus === "retrying" || row.variantStatus === "failed")
            .sort((left, right) => (left.variantUpdatedAt ?? 0) - (right.variantUpdatedAt ?? 0))
            .slice(0, args.limit ?? 50)
            .map((row) => ({
                fileId: row._id,
                status: row.variantStatus,
                attempts: row.variantAttempts,
                maxAttempts: MAX_VARIANT_ATTEMPTS,
                error: row.variantError ?? null,
            }));
    },
});
