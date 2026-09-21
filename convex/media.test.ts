import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { eventFixture, initConvexTest } from "./test.setup";
import {
    MAX_FILE_SIZE_BYTES,
    MAX_VARIANT_ATTEMPTS,
    buildBasePath,
    extensionOf,
    isProcessableImage,
    nextVariantState,
    originalKey,
    variantKey,
} from "./lib/media";

/**
 * G08 — files and observable image variants (plan Task 7).
 *
 * Hermetic (convex-test, no deployment, no R2, no Images): what it proves is the
 * part that must be right before the bridge is trusted — who may upload, which
 * key may confirm, that a file cannot become `ready` with content that does not
 * match its declared type, that dedup is tenant-scoped, and that the variant
 * pipeline is a real state machine (two variants max, five attempts, terminal
 * `failed`) rather than a best-effort side effect.
 *
 * The R2/Images legs of the gate are the Worker bridges, exercised separately.
 */

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;

const alice = { subject: "auth_media_alice", email: "media-alice@example.com", name: "Alice" };
const bob = { subject: "auth_media_bob", email: "media-bob@example.com", name: "Bob" };

const session = (t: Test, user: typeof alice): Session =>
    t.withIdentity({ subject: user.subject, email: user.email, ...(user.name ? { name: user.name } : {}) });

async function bootstrap() {
    const t = initConvexTest();
    const aliceSession = session(t, alice);
    const provisioned = await aliceSession.mutation(api.organizations.ensureProvisioned, {});

    return { t, aliceSession, organizationId: provisioned.organizationId };
}

/** Adds a second provisioned user (a fresh personal org of their own). */
async function addUser(t: Test, user: typeof bob) {
    const s = session(t, user);
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});
    return { s, organizationId: provisioned.organizationId };
}

const appUserId = async (ctx: Test | Session, email: string): Promise<Id<"appUsers">> =>
    ctx.run(async (c) =>
        (await c.db
            .query("appUsers")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique())!._id,
    );

const fileById = (ctx: Test, fileId: Id<"files">) => ctx.run(async (c) => c.db.get(fileId));

const auditActions = async (ctx: Test): Promise<string[]> =>
    (await ctx.run(async (c) => c.db.query("auditLogs").collect())).map((row) => row.action);

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}`).toBeDefined();
    const message = JSON.stringify(caught);
    expect(message, `expected ${code} in ${message}`).toContain(code);
}

const base64 = (bytes: number[]): string => Buffer.from(Uint8Array.from(bytes)).toString("base64");

const PNG_HEAD = base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG_HEAD = base64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP_HEAD = base64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const AVIF_HEAD = base64([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
const PDF_HEAD = base64([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const NOT_A_PNG = base64([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);

/** Creates a pending upload row and returns its id (as `presignUpload` would). */
async function seedPending(
    t: Test,
    args: {
        organizationId: Id<"organizations">;
        uploadedBy: Id<"appUsers">;
        mimeType?: string;
        originalName?: string;
        isPublic?: boolean;
    },
): Promise<Id<"files">> {
    const id = `seed-${Math.random().toString(36).slice(2)}`;
    const basePath = buildBasePath({ id, date: new Date("2026-09-21T00:00:00Z") });
    const result = await t.mutation(internal.files.insertPendingUpload, {
        organizationId: args.organizationId,
        uploadedBy: args.uploadedBy,
        authUserId: alice.subject,
        originalName: args.originalName ?? "photo.png",
        mimeType: args.mimeType ?? "image/png",
        fileSize: 1024,
        path: originalKey(basePath, args.originalName ?? "photo.png"),
        basePath,
        isPublic: args.isPublic ?? true,
        presignExpiresAt: Date.now() + 900_000,
    });
    return result.fileId;
}

/** Marks a pending row active as `finalizeUpload` would, for variant tests. */
async function seedActiveImage(
    t: Test,
    args: {
        organizationId: Id<"organizations">;
        uploadedBy: Id<"appUsers">;
        mimeType?: string;
        headBytes?: string;
        sha256?: string;
    },
): Promise<Id<"files">> {
    const fileId = await seedPending(t, {
        organizationId: args.organizationId,
        uploadedBy: args.uploadedBy,
        mimeType: args.mimeType ?? "image/png",
    });
    const finalized = await t.mutation(internal.files.finalizeUpload, {
        fileId,
        appUserId: args.uploadedBy,
        authUserId: alice.subject,
        headBytes: args.headBytes ?? PNG_HEAD,
        sha256: args.sha256 ?? "a".repeat(64),
        size: 1024,
    });
    if (finalized.status !== "active") throw new Error(`seed failed: ${finalized.status}`);
    return finalized.fileId;
}

// ---------------------------------------------------------------------------
// Pure helpers (the shared definitions the gate leans on)
// ---------------------------------------------------------------------------

describe("media helpers", () => {
    it("derives the legacy R2 key layout", () => {
        const basePath = buildBasePath({ id: "abc", date: new Date("2026-09-21T00:00:00Z") });
        expect(basePath).toBe("global/2026-09/abc");
        expect(buildBasePath({ id: "abc", date: new Date("2026-09-21T00:00:00Z"), eventId: "evt1" })).toBe(
            "evt/evt1/2026-09/abc",
        );

        expect(originalKey(basePath, "Photo.JPEG")).toBe("global/2026-09/abc/original.jpeg");
        expect(originalKey(basePath, "no-extension")).toBe("global/2026-09/abc/original");
        expect(variantKey(basePath, "thumb")).toBe("global/2026-09/abc/thumb.webp");
        expect(variantKey(basePath, "web")).toBe("global/2026-09/abc/web.webp");

        expect(extensionOf("a.b.png")).toBe("png");
        expect(extensionOf(".hidden")).toBe("");
        expect(extensionOf("trailing.")).toBe("");
    });

    it("classifies what the bridge can process", () => {
        expect(isProcessableImage("image/png")).toBe(true);
        expect(isProcessableImage("image/avif")).toBe(true);
        expect(isProcessableImage("application/pdf")).toBe(false);
        expect(isProcessableImage("application/zip")).toBe(false);
    });

    it("makes failure terminal only after the attempt budget is spent", () => {
        expect(nextVariantState({ attempts: 0 }, "failure")).toEqual({
            status: "retrying",
            attempts: 1,
            terminal: false,
        });
        expect(nextVariantState({ attempts: MAX_VARIANT_ATTEMPTS - 2 }, "failure")).toEqual({
            status: "retrying",
            attempts: MAX_VARIANT_ATTEMPTS - 1,
            terminal: false,
        });
        expect(nextVariantState({ attempts: MAX_VARIANT_ATTEMPTS - 1 }, "failure")).toEqual({
            status: "failed",
            attempts: MAX_VARIANT_ATTEMPTS,
            terminal: true,
        });
        expect(nextVariantState({ attempts: 2 }, "success").status).toBe("ready");
    });
});

// ---------------------------------------------------------------------------
// Authorization ordering
// ---------------------------------------------------------------------------

describe("file authorization", () => {
    it("refuses anonymous callers before anything else", async () => {
        const { t } = await bootstrap();

        await expectCode(
            t.action(api.files.presignUpload, {
                originalName: "photo.png",
                mimeType: "image/png",
                fileSize: 1024,
            }),
            "UNAUTHENTICATED",
        );
    });

    it("validates size and type before touching the storage bridge", async () => {
        const { aliceSession } = await bootstrap();

        // Oversize and disallowed types are refused with their own codes: neither
        // can have reached the bridge, which is not even configured in this suite.
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "huge.png",
                mimeType: "image/png",
                fileSize: MAX_FILE_SIZE_BYTES + 1,
            }),
            "FILE_TOO_LARGE",
        );
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "archive.zip",
                mimeType: "application/zip",
                fileSize: 1024,
            }),
            "FILE_TYPE_NOT_ALLOWED",
        );
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "empty.png",
                mimeType: "image/png",
                fileSize: 0,
            }),
            "FILE_SIZE_INVALID",
        );

        // A valid request gets all the way to the bridge and stops there: proof
        // that the refusals above happened *before* the provider step.
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "photo.png",
                mimeType: "image/png",
                fileSize: 1024,
            }),
            "STORAGE_BRIDGE_NOT_CONFIGURED",
        );
    });

    it("refuses an event from another organization", async () => {
        const { t, aliceSession } = await bootstrap();
        const { organizationId: bobOrgId } = await addUser(t, bob);

        const foreignEvent = await t.run(async (c) =>
            c.db.insert("events", eventFixture(bobOrgId)),
        );

        // The event belongs to Bob: Alice must not be able to scope a key to it.
        await expectCode(
            aliceSession.action(api.files.presignUpload, {
                originalName: "photo.png",
                mimeType: "image/png",
                fileSize: 1024,
                eventId: foreignEvent,
            }),
            "EVENT_NOT_FOUND",
        );
    });
});

// ---------------------------------------------------------------------------
// Confirm: only the issuing key, only the right bytes
// ---------------------------------------------------------------------------

describe("upload confirmation", () => {
    it("confirms only the pending row the caller owns", async () => {
        const { t, aliceSession, organizationId } = await bootstrap();
        const { s: bobSession } = await addUser(t, bob);

        const aliceUserId = await appUserId(aliceSession, alice.email);
        const bobUserId = await appUserId(bobSession, bob.email);

        const fileId = await seedPending(t, { organizationId, uploadedBy: aliceUserId });

        // Bob cannot confirm Alice's pending upload even by guessing the id.
        await expectCode(
            bobSession.query(internal.files.getPendingForConfirm, { fileId, appUserId: bobUserId }),
            "PENDING_UPLOAD_NOT_FOUND",
        );

        const pending = await aliceSession.query(internal.files.getPendingForConfirm, {
            fileId,
            appUserId: aliceUserId,
        });
        expect(pending.uploadStatus).toBe("pending");
    });

    it("refuses to confirm a row that is no longer pending", async () => {
        const { t, aliceSession, organizationId } = await bootstrap();
        const userId = await appUserId(aliceSession, alice.email);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });

        await expectCode(
            aliceSession.query(internal.files.getPendingForConfirm, { fileId, appUserId: userId }),
            "PENDING_UPLOAD_NOT_FOUND",
        );
    });

    it("never marks a file active when the bytes do not match the declared type", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedPending(t, { organizationId, uploadedBy: userId, mimeType: "image/png" });

        const result = await t.mutation(internal.files.finalizeUpload, {
            fileId,
            appUserId: userId,
            authUserId: alice.subject,
            headBytes: NOT_A_PNG,
            sha256: "b".repeat(64),
            size: 1024,
        });

        expect(result).toEqual({ status: "failed", fileId, reason: "magic_bytes_mismatch" });
        const row = await fileById(t, fileId);
        expect(row?.uploadStatus).toBe("failed");
        expect(row?.isActive).toBe(false);
        expect(row?.variantStatus).not.toBe("ready");
        expect(await auditActions(t)).not.toContain("file.upload_confirmed");
    });

    it("accepts the signatures the legacy validator accepts", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);

        for (const [mimeType, head] of [
            ["image/png", PNG_HEAD],
            ["image/jpeg", JPEG_HEAD],
            ["image/webp", WEBP_HEAD],
            ["image/avif", AVIF_HEAD],
        ] as const) {
            const fileId = await seedPending(t, { organizationId, uploadedBy: userId, mimeType });
            const result = await t.mutation(internal.files.finalizeUpload, {
                fileId,
                appUserId: userId,
                authUserId: alice.subject,
                headBytes: head,
                sha256: `${mimeType.length}`.padStart(64, "c") + mimeType.replace(/\W/g, ""),
                size: 1024,
            });
            expect(result.status, mimeType).toBe("active");
        }
    });

    it("schedules variants for an image and none for a document", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);

        const imageId = await seedActiveImage(t, { organizationId, uploadedBy: userId });
        expect((await fileById(t, imageId))?.variantStatus).toBe("pending");

        const pdfId = await seedPending(t, {
            organizationId,
            uploadedBy: userId,
            mimeType: "application/pdf",
            originalName: "doc.pdf",
        });
        const finalized = await t.mutation(internal.files.finalizeUpload, {
            fileId: pdfId,
            appUserId: userId,
            authUserId: alice.subject,
            headBytes: PDF_HEAD,
            sha256: "d".repeat(64),
            size: 2048,
        });
        expect(finalized.status).toBe("active");
        expect((await fileById(t, pdfId))?.variantStatus).toBe("none");
    });

    it("deduplicates by sha256 inside the tenant and not across tenants", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const { organizationId: bobOrgId } = await addUser(t, bob);
        const bobUserId = await t.run(
            async (c) => (await c.db.query("appUsers").collect()).find((u) => u.email === bob.email)!._id,
        );

        const sha = "e".repeat(64);
        const first = await seedActiveImage(t, { organizationId, uploadedBy: userId, sha256: sha });

        const secondId = await seedPending(t, { organizationId, uploadedBy: userId, originalName: "copy.png" });
        const duplicated = await t.mutation(internal.files.finalizeUpload, {
            fileId: secondId,
            appUserId: userId,
            authUserId: alice.subject,
            headBytes: PNG_HEAD,
            sha256: sha,
            size: 1024,
        });
        expect(duplicated).toEqual({ status: "deduplicated", fileId: secondId, duplicateId: first });
        expect((await fileById(t, secondId))?.uploadStatus).toBe("failed");
        expect(await auditActions(t)).toContain("file.dedup_matched");

        // The same bytes in another tenant are a different file: dedup is a
        // tenant-scoped optimization, never a cross-tenant existence oracle.
        const foreignId = await seedPending(t, {
            organizationId: bobOrgId,
            uploadedBy: bobUserId,
            originalName: "same.png",
        });
        const foreign = await t.mutation(internal.files.finalizeUpload, {
            fileId: foreignId,
            appUserId: bobUserId,
            authUserId: bob.subject,
            headBytes: PNG_HEAD,
            sha256: sha,
            size: 1024,
        });
        expect(foreign.status).toBe("active");
    });
});

// ---------------------------------------------------------------------------
// Variant state machine
// ---------------------------------------------------------------------------

describe("variant pipeline", () => {
    it("moves pending → processing → ready with at most two variant rows", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });

        const started = await t.mutation(internal.media.startProcessing, { fileId });
        expect(started.shouldProcess).toBe(true);
        expect((await fileById(t, fileId))?.variantStatus).toBe("processing");

        const basePath = (await fileById(t, fileId))!.basePath;
        const result = await t.mutation(internal.media.processVariantResult, {
            fileId,
            ok: true,
            variants: [
                { type: "thumb", key: variantKey(basePath, "thumb"), size: 111 },
                { type: "web", key: variantKey(basePath, "web"), size: 222 },
            ],
        });

        expect(result).toEqual({ status: "ready", inserted: 2, updated: 0 });
        const original = await fileById(t, fileId);
        expect(original?.variantStatus).toBe("ready");
        expect(original?.variantError).toBeUndefined();

        const variants = await t.run(async (c) =>
            c.db.query("files").withIndex("by_variant_of", (q) => q.eq("variantOf", fileId)).collect(),
        );
        expect(variants.map((v) => v.variantType).sort()).toEqual(["thumb", "web"]);
        expect(variants.every((v) => v.sha256 === undefined)).toBe(true);
        expect(await auditActions(t)).toContain("file.variant_ready");
    });

    it("is idempotent: a redelivered success updates instead of inserting", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });
        await t.mutation(internal.media.startProcessing, { fileId });

        const basePath = (await fileById(t, fileId))!.basePath;
        const variants = [
            { type: "thumb" as const, key: variantKey(basePath, "thumb"), size: 100 },
            { type: "web" as const, key: variantKey(basePath, "web"), size: 200 },
        ];
        await t.mutation(internal.media.processVariantResult, { fileId, ok: true, variants });

        const replay = await t.mutation(internal.media.processVariantResult, { fileId, ok: true, variants });
        expect(replay).toEqual({ status: "ready", inserted: 0, updated: 0 });

        const rows = await t.run(async (c) =>
            c.db.query("files").withIndex("by_variant_of", (q) => q.eq("variantOf", fileId)).collect(),
        );
        expect(rows).toHaveLength(2);
    });

    it("refuses more than two variants or a variant pointing at a foreign key", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });
        await t.mutation(internal.media.startProcessing, { fileId });
        const basePath = (await fileById(t, fileId))!.basePath;

        await expectCode(
            t.mutation(internal.media.processVariantResult, {
                fileId,
                ok: true,
                variants: [
                    { type: "thumb", key: variantKey(basePath, "thumb"), size: 1 },
                    { type: "web", key: variantKey(basePath, "web"), size: 2 },
                    { type: "thumb", key: variantKey(basePath, "thumb"), size: 3 },
                ],
            }),
            "VARIANT_COUNT_INVALID",
        );

        await expectCode(
            t.mutation(internal.media.processVariantResult, {
                fileId,
                ok: true,
                variants: [{ type: "thumb", key: "global/2026-09/somewhere-else/thumb.webp", size: 1 }],
            }),
            "VARIANT_KEY_MISMATCH",
        );
    });

    it("retries a failure up to the budget and then stays terminally failed", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });

        const statuses: string[] = [];
        for (let attempt = 0; attempt < MAX_VARIANT_ATTEMPTS; attempt += 1) {
            await t.mutation(internal.media.startProcessing, { fileId });
            const result = await t.mutation(internal.media.recordProcessingFailure, {
                fileId,
                error: "images_binding_timeout",
            });
            statuses.push(result.status);
        }

        expect(statuses.slice(0, -1).every((status) => status === "retrying")).toBe(true);
        expect(statuses.at(-1)).toBe("failed");

        const row = await fileById(t, fileId);
        expect(row?.variantStatus).toBe("failed");
        expect(row?.variantAttempts).toBe(MAX_VARIANT_ATTEMPTS);
        expect(row?.variantError).toBe("images_binding_timeout");
        expect(await auditActions(t)).toContain("file.variant_failed");

        // Terminal means terminal: another failure cannot push it elsewhere.
        const after = await t.mutation(internal.media.recordProcessingFailure, {
            fileId,
            error: "again",
        });
        expect(after.status).toBe("failed");
        expect(after.attempts).toBe(MAX_VARIANT_ATTEMPTS + 1);
    });

    it("will not hand the bridge a file whose variants are already done", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });
        await t.mutation(internal.media.startProcessing, { fileId });
        const basePath = (await fileById(t, fileId))!.basePath;
        await t.mutation(internal.media.processVariantResult, {
            fileId,
            ok: true,
            variants: [
                { type: "thumb", key: variantKey(basePath, "thumb"), size: 1 },
                { type: "web", key: variantKey(basePath, "web"), size: 2 },
            ],
        });

        expect((await t.mutation(internal.media.startProcessing, { fileId })).shouldProcess).toBe(false);
    });

    it("lets an admin retry a failed file without resetting the attempt budget", async () => {
        const { t, organizationId } = await bootstrap();
        const userId = await t.run(async (c) => (await c.db.query("appUsers").first())!._id);
        const fileId = await seedActiveImage(t, { organizationId, uploadedBy: userId });
        for (let attempt = 0; attempt < MAX_VARIANT_ATTEMPTS; attempt += 1) {
            await t.mutation(internal.media.recordProcessingFailure, { fileId, error: "boom" });
        }

        const attention = await t.query(internal.media.variantsNeedingAttention, {});
        expect(attention).toEqual([
            {
                fileId,
                status: "failed",
                attempts: MAX_VARIANT_ATTEMPTS,
                maxAttempts: MAX_VARIANT_ATTEMPTS,
                error: "boom",
            },
        ]);

        const retry = await t.mutation(internal.media.retryVariant, { fileId });
        expect(retry).toMatchObject({ retried: true, basePath: (await fileById(t, fileId))!.basePath });
        const row = await fileById(t, fileId);
        expect(row?.variantStatus).toBe("pending");
        expect(row?.variantAttempts).toBe(MAX_VARIANT_ATTEMPTS);

        // An already-ready file is not retryable.
        const other = await seedActiveImage(t, { organizationId, uploadedBy: userId, sha256: "f".repeat(64) });
        await t.mutation(internal.media.startProcessing, { fileId: other });
        const otherBase = (await fileById(t, other))!.basePath;
        await t.mutation(internal.media.processVariantResult, {
            fileId: other,
            ok: true,
            variants: [
                { type: "thumb", key: variantKey(otherBase, "thumb"), size: 1 },
                { type: "web", key: variantKey(otherBase, "web"), size: 2 },
            ],
        });
        expect(await t.mutation(internal.media.retryVariant, { fileId: other })).toEqual({
            retried: false,
            reason: "status_ready",
        });
    });
});
