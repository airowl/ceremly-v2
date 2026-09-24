import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { normalizeEmail } from "../lib/identity";
import { assertMigrationKey } from "../lib/migrationKey";
import { isProcessableImage } from "../lib/media";
import { canonicalJson } from "../lib/bridgeHmac";
import {
    IMPORT_DEPENDENCIES,
    domainBatchDigest,
    isDomainImportTable,
    type DomainImportTable,
} from "../lib/domainBatchDigest";

/**
 * Domain import (plan Task 10, Steps 3 and 4).
 *
 * The legacy Neon database is exported table by table and replayed here through
 * `internal.migrations.domainImport.importBatch`. The batch protocol (legal
 * order, dependencies, digest) is specified in `shared/migration/domainBatch.ts`
 * and mirrored in `convex/lib/domainBatchDigest.ts`.
 *
 * Four properties the legacy `INSERT ... SELECT` migration did not have, and why
 * each one matters:
 *
 * 1. **Idempotente per costruzione.** Every table declares its natural keys — the
 *    ones the legacy schema actually enforced with a UNIQUE constraint, not a
 *    fresh invention — and the runner looks each record up before inserting it.
 *    Running the same batch twice imports nothing the second time, and a batch
 *    that was cut again with a later watermark cannot duplicate rows (the
 *    watermark is informational precisely for this reason).
 * 2. **Ordine topologico applicato, non documentato.** A batch may only be
 *    imported if every table a record in it *actually references* has already
 *    been imported (a `migrationRecords` row exists). Referencing tables are
 *    derived from the same `refs` declaration used for resolution, so the gate
 *    cannot disagree with the resolution it guards. This is why an empty table
 *    must still be sent: the row is what proves the prerequisite was handled.
 * 3. **Foreign key logiche verificate.** Each reference is resolved to the Convex
 *    id of the migrated parent (`by_legacy_id`), and the policy is explicit:
 *    tenant-critical keys are `strict` (a present-but-missing parent aborts the
 *    batch), provenance/telemetry links are `best-effort` (they degrade to
 *    absent and are *counted* in `danglingRefs`). Nothing is silently dropped: a
 *    record can be imported, skipped, deferred with a named reason, or rejected —
 *    never quietly altered.
 * 4. **Digest verificato.** The batch carries `sha256`; the importer recomputes
 *    it over the canonical payload and refuses a mismatch, so a truncated or
 *    edited export fails before a single document is written.
 *
 * The whole batch runs in one Convex mutation, which is one transaction: a
 * rejected record rolls back its whole batch. Nothing is ever half-imported.
 */

// ---------------------------------------------------------------------------
// Specs: the legacy → Convex translation, one declaration per table
// ---------------------------------------------------------------------------

export interface RefSpec {
    /** Legacy column carrying the parent's legacy id. */
    field: string;
    /** Table the reference points at. */
    table: DomainImportTable;
    /** Convex field receiving the resolved id. */
    as?: string;
    /**
     * `strict` — a present value must resolve, else the batch is rejected.
     * `best-effort` — an unresolved value becomes absent and is counted.
     */
    mode: "strict" | "best-effort";
}

export interface NaturalKey {
    /** Convex index, in the exact field order it was declared with. */
    index: string;
    fields: readonly string[];
}

/**
 * A child row must not point at a parent that belongs to another tenant.
 *
 * Resolving a reference proves the parent *exists*; it says nothing about the
 * organization it belongs to. The legacy schema had the same blind spot (each
 * table carried its own `organization_id` and nothing compared them), so a row
 * whose columns disagreed would migrate silently and become a cross-tenant read
 * the moment a query joined through it. This is the check that keeps the
 * invariant "every tenant resource is reachable only through its own org" true
 * after the migration.
 */
export interface CoherenceRule {
    /** Resolved local field holding the parent id. */
    field: string;
    /** Table the parent lives in. */
    table: DomainImportTable;
    /** Parent field that must equal `localField` on the record. */
    parentField: string;
    localField: string;
}

export interface TableSpec {
    table: DomainImportTable;
    /** Columns copied verbatim (present and not null). */
    fields: readonly string[];
    /** Columns converted to epoch milliseconds. */
    timestamps?: readonly string[];
    /** Columns that the legacy declared NOT NULL: absence is a corrupt export. */
    required: readonly string[];
    /** Legacy column → Convex field, when the name changed. */
    rename?: Readonly<Record<string, string>>;
    /** Logical foreign keys. */
    refs?: readonly RefSpec[];
    /** Tenant coherence between a child row and the parent it points at. */
    coherence?: readonly CoherenceRule[];
    /** Dedup keys, first match wins. May use resolved refs. */
    naturalKeys: readonly NaturalKey[];
    /**
     * Legacy columns with no home in the Convex model, each with the reason.
     * Declaring them is what turns "the migration drops a few columns" into an
     * inspectable list instead of a surprise found months later.
     */
    ignored?: Readonly<Record<string, string>>;
    /** Columns whose value is derived rather than copied. */
    computed?: readonly string[];
    /**
     * Computed columns the Convex runtime owns after the import (e.g. the
     * variant pipeline's progress). An `upsert` never rewrites them: the legacy
     * has no opinion on state that only exists on the new stack.
     */
    preserveOnUpdate?: readonly string[];
    /** Computed values, possibly async (component lookups, derived keys). */
    build?: (
        ctx: MutationCtx,
        record: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
}

const ref = (
    field: string,
    table: DomainImportTable,
    mode: RefSpec["mode"],
    as?: string,
): RefSpec => ({ field, table, mode, ...(as ? { as } : {}) });

/** `parentField` of the referenced parent must equal `localField` of the record. */
const sameValue = (
    field: string,
    table: DomainImportTable,
    parentField: string,
    localField = field,
): CoherenceRule => ({ field, table, parentField, localField });

const sameOrganization = (
    field: string,
    table: DomainImportTable,
): CoherenceRule => sameValue(field, table, "organizationId", "organizationId");

const SPECS: readonly TableSpec[] = [
    {
        table: "appUsers",
        fields: [],
        required: ["email"],
        rename: { id: "legacyId" },
        naturalKeys: [
            { index: "by_email", fields: ["email"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        ignored: {
            name: "owned by the Better Auth component (Task 4 import)",
            emailVerified: "owned by the Better Auth component",
            image: "owned by the Better Auth component",
            createdAt: "owned by the Better Auth component",
            updatedAt: "owned by the Better Auth component",
            twoFactorEnabled: "owned by the Better Auth component",
            banned: "no equivalent: the admin plugin is not enabled (Task 4)",
            banReason: "no equivalent: the admin plugin is not enabled",
            banExpires: "no equivalent: the admin plugin is not enabled",
            creemCustomerId: "owned by the Creem component",
            hadTrial: "no consumer in the current app",
            tosAcceptedAt: "no consumer in the current app (profile is Task 12)",
            phone: "profile field, Task 12",
            bio: "profile field, Task 12",
            timezone: "profile field, Task 12",
        },
        computed: ["authUserId", "email", "globalRole", "locale"],
        // `authUserId` is the *Better Auth* id, not the legacy one: the component
        // was imported in Task 4 and ids changed, so the profile is linked by
        // email. A legacy user whose credential was not imported cannot be given
        // a profile — that is a hard error, not a row pointing at nothing.
        build: async (ctx, record) => {
            const email = normalizeEmail(String(record.email));
            const authUserId = await findAuthUserIdByEmail(ctx, email);

            if (!authUserId) {
                throw new ConvexError({ code: "AUTH_USER_NOT_IMPORTED", email });
            }

            return {
                authUserId,
                email,
                globalRole: record.role === "superAdmin" ? "superAdmin" : "user",
                locale: typeof record.locale === "string" && record.locale ? record.locale : "it",
            };
        },
    },
    {
        table: "organizations",
        fields: ["name", "slug", "logo"],
        timestamps: ["createdAt"],
        required: ["name", "slug"],
        naturalKeys: [
            { index: "by_slug", fields: ["slug"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        ignored: { metadata: "legacy Better Auth organization column, never read by the app" },
    },
    {
        table: "memberships",
        fields: ["role"],
        timestamps: ["createdAt"],
        required: ["role"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("userId", "appUsers", "strict"),
        ],
        naturalKeys: [
            { index: "by_org_user", fields: ["organizationId", "userId"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
    },
    {
        table: "invitations",
        fields: ["email", "role", "status"],
        timestamps: ["expiresAt", "createdAt"],
        required: ["email", "status"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("inviterId", "appUsers", "strict", "inviterUserId"),
        ],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
        // `tokenHash`, `acceptedAt`, `acceptedByUserId` and `canceledAt` stay
        // absent: the legacy table has no such columns (Better Auth stored no
        // token and no acceptance timestamp), so an imported invitation carries
        // its legacy status but not a fabricated history.
        computed: ["tokenHash", "acceptedAt", "acceptedByUserId", "canceledAt"],
    },
    {
        table: "events",
        fields: [
            "type",
            "templateKey",
            "theme",
            "inviteFont",
            "title",
            "slug",
            "eventTime",
            "locationName",
            "locationAddress",
            "status",
            "blocks",
            "rsvpConfig",
            "rsvpClosedMessage",
            "distribution",
            "tier",
            "creemOrderId",
            "creemCheckoutId",
        ],
        timestamps: [
            "eventDate",
            "rsvpDeadline",
            "unlockedAt",
            "cleanupWarnedAt",
            "createdAt",
            "updatedAt",
        ],
        required: ["type", "templateKey", "title", "slug", "status", "tier"],
        refs: [ref("organizationId", "organizations", "strict")],
        naturalKeys: [
            { index: "by_slug", fields: ["slug"] },
            { index: "by_creem_order_id", fields: ["creemOrderId"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
    },
    {
        table: "projects",
        fields: ["name", "description", "status"],
        timestamps: ["createdAt", "updatedAt"],
        required: ["name", "status"],
        refs: [ref("organizationId", "organizations", "strict")],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
    },
    {
        table: "guests",
        fields: [
            "firstName",
            "lastName",
            "phone",
            "groupName",
            "notes",
            "token",
            "sentChannel",
            "openCount",
            "remindersDisabled",
        ],
        timestamps: [
            "sentAt",
            "emailOpenedAt",
            "firstOpenedAt",
            "removedAt",
            "createdAt",
            "updatedAt",
        ],
        required: ["firstName", "lastName", "token"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("eventId", "events", "strict"),
        ],
        coherence: [sameOrganization("eventId", "events")],
        naturalKeys: [
            { index: "by_token", fields: ["token"] },
            // The legacy partial unique index was (eventId, lower(email)) where
            // email is not null and removedAt is null: the same key, minus the
            // parts Convex cannot express. `email` is stored normalized, and the
            // soft-delete filter is applied by the caller that needs it.
            { index: "by_event_email", fields: ["eventId", "email"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        computed: ["email"],
        build: async (_ctx, record) => ({
            email: typeof record.email === "string" && record.email ? normalizeEmail(record.email) : undefined,
        }),
    },
    {
        table: "eventReminders",
        fields: ["daysBefore", "subject", "message", "enabled"],
        timestamps: ["sentAt", "processingAt", "createdAt", "updatedAt"],
        required: ["daysBefore", "subject", "message"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("eventId", "events", "strict"),
        ],
        coherence: [sameOrganization("eventId", "events")],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
        computed: ["pending"],
        // `pending` is the Convex equivalent of the legacy partial index
        // `WHERE enabled = true AND sent_at IS NULL` (see the schema comment).
        build: async (_ctx, record) => ({
            pending: record.enabled !== false && isBlank(record.sentAt),
        }),
    },
    {
        table: "rsvpResponses",
        fields: ["attending", "companionsCount", "answers", "declineMessage"],
        timestamps: ["submittedAt", "updatedAt"],
        required: ["attending", "submittedAt"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("eventId", "events", "strict"),
            ref("guestId", "guests", "strict"),
        ],
        coherence: [
            sameOrganization("eventId", "events"),
            sameOrganization("guestId", "guests"),
            // The guest must belong to the event the response is filed under,
            // otherwise an RSVP would be readable from two different events.
            sameValue("guestId", "guests", "eventId", "eventId"),
        ],
        naturalKeys: [
            { index: "by_guest", fields: ["guestId"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
    },
    {
        table: "guestActivities",
        fields: ["type", "meta"],
        timestamps: ["createdAt"],
        required: ["type"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            ref("eventId", "events", "strict"),
            ref("guestId", "guests", "strict"),
        ],
        coherence: [
            sameOrganization("eventId", "events"),
            sameOrganization("guestId", "guests"),
            sameValue("guestId", "guests", "eventId", "eventId"),
        ],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
        computed: ["reminderId"],
        // The legacy kept the reminder id inside `meta.reminderId` and indexed it
        // with an expression index; the Convex model promotes it to a real field
        // (schema comment). `meta` is copied verbatim, so nothing is lost and the
        // new column is a resolution of it.
        build: async (ctx, record) => {
            const meta = record.meta as Record<string, unknown> | null | undefined;
            const legacyReminderId = meta?.reminderId;
            if (typeof legacyReminderId !== "string" || legacyReminderId.length === 0) {
                return {};
            }

            const reminder = await findById(ctx, "eventReminders", legacyReminderId);
            return reminder ? { reminderId: reminder } : {};
        },
    },
    {
        table: "files",
        fields: [
            "originalName",
            "mimeType",
            "fileType",
            "size",
            "path",
            "url",
            "isPublic",
            "isActive",
            "uploadStatus",
            "sha256",
        ],
        timestamps: ["presignExpiresAt", "createdAt", "updatedAt"],
        required: ["originalName", "mimeType", "fileType", "size", "path", "isPublic", "isActive", "uploadStatus"],
        refs: [
            ref("organizationId", "organizations", "strict"),
            // Provenance only: a file whose uploader was deleted is still a file.
            ref("uploadedBy", "appUsers", "best-effort"),
            // Strict, as the plan's Step 3 requires ("rifiutare ... variante
            // senza parent"): a variant row without its original is an object in
            // the bucket whose lifecycle has no owner, which the retry sweep
            // would then pick up forever. The parent must appear earlier in the
            // same `files` sequence (or in an earlier batch) for the batch to
            // succeed, which the reference map below resolves without a second
            // round trip.
            ref("variantOf", "files", "strict"),
        ],
        coherence: [sameOrganization("variantOf", "files")],
        naturalKeys: [
            { index: "by_org_sha256", fields: ["organizationId", "sha256"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        ignored: {
            fileName: "derivable from `path`, and the app never read it",
            storageProvider: "always 'r2' (single storage provider)",
            variantsGeneratedAt: "superseded by `variantUpdatedAt`/`variantStatus`",
        },
        computed: ["basePath", "variantType", "variantStatus", "variantAttempts", "variantUpdatedAt"],
        preserveOnUpdate: ["variantStatus", "variantAttempts", "variantUpdatedAt"],
        build: async (_ctx, record) => {
            const path = String(record.path);
            const variantType = typeof record.variantType === "string" ? record.variantType : "original";
            const generatedAt = toEpochMs(record.variantsGeneratedAt);
            const mimeType = String(record.mimeType);

            // Legacy `file.path` is the full R2 key; the base path is its
            // directory (both for an original and for a variant — Task 7's layout
            // is unchanged).
            const separator = path.lastIndexOf("/");

            const variantStatus =
                variantType !== "original"
                    ? "none"
                    : generatedAt
                      ? "ready"
                      : isProcessableImage(mimeType)
                        ? "pending"
                        : "none";

            return {
                basePath: separator > 0 ? path.slice(0, separator) : "",
                variantType,
                variantStatus,
                variantAttempts: 0,
                variantUpdatedAt: generatedAt ?? toEpochMs(record.updatedAt) ?? undefined,
            };
        },
    },
    {
        table: "emailSuppressions",
        fields: ["reason", "bounceSubtype", "source"],
        timestamps: ["createdAt"],
        required: ["email", "reason", "source"],
        naturalKeys: [
            { index: "by_email", fields: ["email"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        computed: ["email"],
        build: async (_ctx, record) => ({ email: normalizeEmail(String(record.email)) }),
    },
    {
        table: "emailEvents",
        fields: ["messageId", "type", "recipient", "emailType", "clickedUrl", "payload"],
        timestamps: ["occurredAt", "createdAt"],
        required: ["messageId", "type", "recipient"],
        refs: [
            // Telemetry: the legacy columns carried no FK and a webhook row is
            // evidence in itself, so an unresolvable reference degrades to absent.
            ref("organizationId", "organizations", "best-effort"),
            ref("guestId", "guests", "best-effort"),
            ref("eventId", "events", "best-effort"),
        ],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
    },
    {
        table: "dataExports",
        fields: [
            "status",
            "format",
            "downloadUrl",
            "downloadToken",
            "errorMessage",
            "fileSize",
        ],
        timestamps: ["expiresAt", "completedAt", "createdAt"],
        required: ["status", "format"],
        refs: [ref("userId", "appUsers", "strict")],
        naturalKeys: [
            { index: "by_download_token", fields: ["downloadToken"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
    },
    {
        table: "auditLogs",
        fields: [
            "category",
            "action",
            "targetType",
            "targetId",
            "status",
            "details",
            "ipAddress",
            "userAgent",
        ],
        timestamps: ["createdAt"],
        required: ["category", "action"],
        refs: [
            // Historical evidence: an actor or tenant that no longer exists (the
            // legacy FK was ON DELETE SET NULL) does not invalidate the entry.
            ref("userId", "appUsers", "best-effort", "actorAppUserId"),
            ref("organizationId", "organizations", "best-effort"),
        ],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
        computed: ["actorAuthUserId"],
        build: async (ctx, record) => {
            // The legacy audit row recorded the legacy user id; the actor's
            // *Better Auth* id is what makes an entry greppable next to the ones
            // written after the cutover, so it is resolved when possible.
            const legacyUserId = record.userId;
            if (typeof legacyUserId !== "string" || legacyUserId.length === 0) return {};

            const appUser = await findById(ctx, "appUsers", legacyUserId);
            if (!appUser) return {};

            const doc = (await ctx.db.get(appUser as never)) as { authUserId?: string } | null;
            return doc?.authUserId ? { actorAuthUserId: doc.authUserId } : {};
        },
    },
    {
        table: "contactMessages",
        fields: ["name", "email", "subject", "message", "language", "isArchived"],
        timestamps: ["archivedAt", "createdAt"],
        required: ["name", "email", "subject", "message"],
        naturalKeys: [{ index: "by_legacy_id", fields: ["legacyId"] }],
    },
    {
        table: "waitingList",
        fields: [
            "email",
            "language",
            "source",
            "utmSource",
            "utmMedium",
            "utmCampaign",
            "ipAddress",
            "userAgent",
        ],
        timestamps: ["createdAt"],
        required: ["email"],
        naturalKeys: [
            { index: "by_email", fields: ["email"] },
            { index: "by_legacy_id", fields: ["legacyId"] },
        ],
        computed: ["email"],
        build: async (_ctx, record) => ({ email: normalizeEmail(String(record.email)) }),
    },
];

/**
 * The translation table, exported read-only for `scripts/migration/reconcile.ts`:
 * the reconciliation compares exactly the columns the import copies, from this
 * declaration rather than from a second list that could drift from it.
 */
export const DOMAIN_IMPORT_SPECS: readonly TableSpec[] = SPECS;

const SPEC_BY_TABLE = new Map<DomainImportTable, TableSpec>(
    SPECS.map((spec) => [spec.table, spec]),
);

/**
 * Records that are deliberately **not** imported, with the reason.
 *
 * Both cases are data facts, not corruption, and both need an owner decision
 * after the migration — which is why they are counted and named per batch rather
 * than dropped:
 *
 * - `pendingInvitation`: the legacy `invitation` table has no token column
 *   (verified in `server/database/schema/auth.ts`): Better Auth stored the token
 *   nowhere, so a pending invitation cannot be migrated. Re-issuing it is the only
 *   correct action — inventing a token hash would create a credential nobody was
 *   ever sent, and a *guessable* one would be worse.
 * - `globalFileWithoutOrganization`: the legacy `file.organization_id` was
 *   nullable (`ON DELETE SET NULL`) and the Convex model requires an owner
 *   tenant. A file with no organization needs a placement decision, not a
 *   default.
 */
export function deferReason(table: DomainImportTable, record: Record<string, unknown>): string | null {
    if (table === "invitations" && (record.status === "pending" || record.status === undefined)) {
        return "pendingInvitation";
    }
    if (table === "files" && (record.organizationId === null || record.organizationId === undefined)) {
        return "globalFileWithoutOrganization";
    }
    return null;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface DanglingRef {
    field: string;
    table: string;
    legacyId: string;
}

export interface DomainImportBatchResult {
    table: DomainImportTable;
    batchIndex: number;
    /** Records in the batch. */
    records: number;
    imported: number;
    /** Records whose natural key already existed (a re-import, or a self-duplicate). */
    skipped: number;
    /** Migrated records whose changed columns were rewritten (`upsert` only). */
    updated: number;
    /** Records deliberately not imported, by reason. */
    deferred: Record<string, number>;
    /** Legacy columns with a declared reason for having no Convex home. */
    ignoredColumns: string[];
    /** Legacy columns the spec does not know at all: schema drift, never silent. */
    unknownColumns: string[];
    /** Best-effort references that could not be resolved (counted, not thrown). */
    danglingRefs: DanglingRef[];
    /** True when this (table, batchIndex) had already been journalled. */
    replayed: boolean;
    digest: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Legacy timestamps arrive as `Date`, ISO string or epoch — the same three shapes
 * the auth export produced. `null`/`undefined` mean "no value", which the Convex
 * model expresses as an absent optional field.
 */
function toEpochMs(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return undefined;
    if (value instanceof Date) return value.getTime();

    const parsed = Date.parse(String(value));
    if (Number.isNaN(parsed)) {
        throw new ConvexError({ code: "INVALID_DOMAIN_IMPORT_RECORD", reason: "unparsable timestamp", value: String(value) });
    }
    return parsed;
}

const isBlank = (value: unknown): boolean =>
    value === null || value === undefined || value === "";

/**
 * Shape of a dynamic-table query. Convex types `query(tableName)` and its indexes
 * per table, which a table-agnostic runner cannot express; the casts below are
 * confined to this interface so resolution and dedup share one door.
 */
interface DynamicIndexQuery {
    withIndex(
        index: string,
        builder: (q: { eq(field: string, value: unknown): unknown }) => unknown,
    ): { first(): Promise<unknown>; unique(): Promise<unknown> };
}

/** Runtime id of a Convex document. Validators accept the wire form (a string). */
type DocumentId = string;

/**
 * The Better Auth component's user id for an address.
 *
 * The Convex JWT subject *is* the component's user id, so this is the value
 * `appUsers.authUserId` must hold. Queried through the component adapter (the
 * same door `lib/identity` uses) and read defensively: the adapter returns `id`,
 * the raw table uses `_id`.
 */
async function findAuthUserIdByEmail(
    ctx: MutationCtx,
    email: string,
): Promise<string | null> {
    const doc = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: email }],
    })) as { id?: unknown; _id?: unknown } | null;

    const id = doc?.id ?? doc?._id;
    return typeof id === "string" && id.length > 0 ? id : null;
}

/** Convex id of the migrated row whose legacy id is `legacyId`, or `null`. */
async function findById(
    ctx: MutationCtx,
    table: DomainImportTable,
    legacyId: string,
): Promise<DocumentId | null> {
    const doc = (await (ctx.db.query(table) as unknown as DynamicIndexQuery)
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
        // `.unique()` rather than `.first()`: a legacy primary key cannot repeat,
        // so two rows for one legacy id means the import already duplicated a
        // record — an error worth throwing instead of silently picking one.
        .unique()) as { _id: DocumentId } | null;

    return doc?._id ?? null;
}

/**
 * Reads a parent row once per batch.
 *
 * Coherence checks walk the same parents over and over (every guest of an event,
 * every response of a guest); without the cache the transaction would issue one
 * read per row for a fact that cannot change inside it.
 */
async function loadDocument(
    ctx: MutationCtx,
    cache: Map<string, Record<string, unknown> | null>,
    id: string,
): Promise<Record<string, unknown> | null> {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;

    const doc = (await ctx.db.get(id as never)) as Record<string, unknown> | null;
    cache.set(id, doc);
    return doc;
}

const knownColumns = (spec: TableSpec): Set<string> => {
    const columns = new Set<string>(["id", ...spec.fields, ...(spec.timestamps ?? [])]);
    for (const reference of spec.refs ?? []) columns.add(reference.field);
    for (const column of Object.keys(spec.ignored ?? {})) columns.add(column);
    return columns;
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * `insert` (default, Task 10): an existing natural key is skipped.
 * `upsert` (Task 16 delta): a row this migration created (same `legacyId`) whose
 * source changed since the full import is rewritten — see `upsertPatch`.
 */
export type DomainImportMode = "insert" | "upsert";

/**
 * The columns of a migrated row that an `upsert` must rewrite so the row equals
 * what a fresh import of `document` would produce.
 *
 * Copied columns (fields, timestamps, references) are rewritten **and cleared**
 * when the source nulled them — `patch` with `undefined` removes the field.
 * Computed columns are rewritten only when the import computes a value, never
 * cleared: an absent computed value (an invitation's `tokenHash`) means "the
 * import has no opinion", not "delete what the new stack wrote". Columns in
 * `preserveOnUpdate` are never touched.
 */
function upsertPatch(
    spec: TableSpec,
    current: Record<string, unknown>,
    document: Record<string, unknown>,
): Record<string, unknown> {
    const preserved = new Set(spec.preserveOnUpdate ?? []);
    const copied = new Set<string>([
        ...spec.fields.map((field) => spec.rename?.[field] ?? field),
        ...(spec.timestamps ?? []),
        ...(spec.refs ?? []).map((reference) => reference.as ?? reference.field),
    ]);
    const computed = new Set((spec.computed ?? []).filter((column) => !preserved.has(column)));

    const patch: Record<string, unknown> = {};
    const differs = (column: string) =>
        canonicalJson(current[column] ?? null) !== canonicalJson(document[column] ?? null);

    for (const column of copied) {
        if (column === "legacyId" || preserved.has(column)) continue;
        if (differs(column)) patch[column] = document[column];
    }
    for (const column of computed) {
        if (copied.has(column) || document[column] === undefined) continue;
        if (differs(column)) patch[column] = document[column];
    }

    return patch;
}

async function importRecords(
    ctx: MutationCtx,
    spec: TableSpec,
    records: Record<string, unknown>[],
    mode: DomainImportMode = "insert",
): Promise<Omit<DomainImportBatchResult, "table" | "batchIndex" | "replayed" | "digest">> {
    const result = {
        records: records.length,
        imported: 0,
        skipped: 0,
        updated: 0,
        deferred: {} as Record<string, number>,
        ignoredColumns: Object.keys(spec.ignored ?? {}).sort(),
        unknownColumns: new Set<string>(),
        danglingRefs: [] as DanglingRef[],
    };

    const known = knownColumns(spec);
    /** legacyId → Convex id, so a self-reference inside one batch resolves. */
    const inserted = new Map<string, DocumentId>();
    const seenLegacyIds = new Set<string>();
    const parents = new Map<string, Record<string, unknown> | null>();

    for (const [index, record] of records.entries()) {
        if (!record || typeof record !== "object") {
            throw new ConvexError({ code: "INVALID_DOMAIN_IMPORT_RECORD", table: spec.table, index });
        }

        // Every migrated record must carry its legacy id: without it a record
        // cannot be deduped, referenced or traced back, and a later re-run would
        // duplicate it.
        const legacyId = isBlank(record.id) ? null : String(record.id);
        if (!legacyId) {
            throw new ConvexError({
                code: "INVALID_DOMAIN_IMPORT_RECORD",
                table: spec.table,
                index,
                reason: "missing legacy id",
            });
        }
        if (seenLegacyIds.has(legacyId)) {
            // Impossible in the source (it is the primary key): a duplicate means
            // the export is corrupt, and importing it would silently merge two
            // distinct rows into one.
            throw new ConvexError({
                code: "DUPLICATE_LEGACY_ID",
                table: spec.table,
                index,
                legacyId,
            });
        }
        seenLegacyIds.add(legacyId);

        for (const column of spec.required) {
            if (isBlank(record[column])) {
                throw new ConvexError({
                    code: "INVALID_DOMAIN_IMPORT_RECORD",
                    table: spec.table,
                    index,
                    legacyId,
                    reason: `missing required column \`${column}\``,
                });
            }
        }

        const deferred = deferReason(spec.table, record);
        if (deferred) {
            result.deferred[deferred] = (result.deferred[deferred] ?? 0) + 1;
            continue;
        }

        const document: Record<string, unknown> = { legacyId };

        for (const field of spec.fields) {
            if (record[field] !== undefined && record[field] !== null) {
                document[spec.rename?.[field] ?? field] = record[field];
            }
        }

        for (const field of spec.timestamps ?? []) {
            const converted = toEpochMs(record[field]);
            if (converted !== undefined) document[field] = converted;
        }

        for (const reference of spec.refs ?? []) {
            const raw = record[reference.field];
            if (isBlank(raw)) {
                if (reference.mode === "strict" && reference.field === "organizationId") {
                    // `organizationId` is required by the Convex model, so its
                    // absence is caught by the validator — but the error would
                    // name a validator, not the row. Say which record it is.
                    throw new ConvexError({
                        code: "INVALID_DOMAIN_IMPORT_RECORD",
                        table: spec.table,
                        index,
                        legacyId,
                        reason: "missing organizationId",
                    });
                }
                continue;
            }

            const target = reference.as ?? reference.field;
            const local = inserted.get(`${reference.table}:${String(raw)}`);
            const resolved = local ?? (await findById(ctx, reference.table, String(raw)));

            if (resolved) {
                document[target] = resolved;
                continue;
            }

            if (reference.mode === "strict") {
                throw new ConvexError({
                    code: "UNRESOLVED_REFERENCE",
                    table: spec.table,
                    index,
                    legacyId,
                    field: reference.field,
                    target: reference.table,
                    referencedLegacyId: String(raw),
                });
            }

            result.danglingRefs.push({
                field: reference.field,
                table: reference.table,
                legacyId: String(raw),
            });
        }

        const built = spec.build ? await spec.build(ctx, record) : {};
        for (const [key, value] of Object.entries(built)) {
            if (value !== undefined) document[key] = value;
        }

        for (const rule of spec.coherence ?? []) {
            const parentId = document[rule.field];
            const localValue = document[rule.localField];
            if (typeof parentId !== "string" || isBlank(localValue)) continue;

            // `null` means the parent was created later in this same batch: the
            // reference itself is what proves its existence, so there is nothing
            // to compare yet.
            const parent = await loadDocument(ctx, parents, parentId);
            if (!parent) continue;

            const parentValue = parent[rule.parentField];
            if (parentValue === localValue) continue;

            throw new ConvexError({
                code: "INCOHERENT_TENANT_REFERENCE",
                table: spec.table,
                index,
                legacyId,
                field: rule.field,
                parentField: rule.parentField,
                parentValue: parentValue === null || parentValue === undefined ? "" : String(parentValue),
                recordValue: String(localValue),
            });
        }

        for (const column of Object.keys(record)) {
            if (!known.has(column)) result.unknownColumns.add(column);
        }

        // Dedup on the natural keys the legacy schema enforced. The lookup uses
        // the *resolved* document, so a key that spans a reference (membership on
        // organization + user) is compared in the new namespace, where the legacy
        // ids no longer exist.
        const existing = await findExisting(ctx, spec, document);
        if (existing) {
            // An existing row that predates the migration (provisioned at first
            // login, or imported in an earlier run) gets the legacy id stamped so
            // later batches can reference it.
            const doc = (await ctx.db.get(existing as never)) as Record<string, unknown> | null;
            inserted.set(`${spec.table}:${legacyId}`, existing);

            if (doc && doc.legacyId === undefined) {
                await ctx.db.patch(existing as never, { legacyId } as never);
            } else if (mode === "upsert" && doc && doc.legacyId === legacyId) {
                // Only a row this migration created is ever rewritten: a row
                // adopted through a natural key keeps what the new stack wrote.
                const patch = upsertPatch(spec, doc, document);
                if (Object.keys(patch).length > 0) {
                    await ctx.db.patch(existing as never, patch as never);
                    result.updated += 1;
                    continue;
                }
            }

            result.skipped += 1;
            continue;
        }

        const id = (await ctx.db.insert(spec.table, document as never)) as DocumentId;
        inserted.set(`${spec.table}:${legacyId}`, id);
        result.imported += 1;
    }

    return { ...result, unknownColumns: [...result.unknownColumns].sort() };
}

/**
 * First matching natural key. Index names and field order come from the spec, so
 * the lookup cannot drift from the index the schema declares.
 */
async function findExisting(
    ctx: MutationCtx,
    spec: TableSpec,
    document: Record<string, unknown>,
): Promise<DocumentId | null> {
    for (const key of spec.naturalKeys) {
        if (key.fields.some((field) => isBlank(document[field]))) continue;

        const doc = (await (ctx.db.query(spec.table) as unknown as DynamicIndexQuery)
            .withIndex(key.index, (q) => {
                let chain = q;
                for (const field of key.fields) {
                    chain = chain.eq(field, document[field]) as typeof chain;
                }
                return chain;
            })
            .first()) as { _id: DocumentId } | null;

        if (doc) return doc._id;
    }

    return null;
}

/**
 * Prerequisites actually needed by this batch, and whether they were imported.
 *
 * The dependency gate is *conditional* on purpose: a batch of RSVP rows in an
 * environment whose guest table is empty does not require an empty `guests`
 * batch, while a batch that does reference guests requires the guest import to
 * have happened. The referenced tables come from the same declarations used for
 * resolution, so "the order is enforced" cannot become "the order is documented
 * twice".
 */
async function assertDependenciesImported(
    ctx: MutationCtx,
    spec: TableSpec,
    records: Record<string, unknown>[],
): Promise<void> {
    for (const dependency of IMPORT_DEPENDENCIES[spec.table]) {
        const referenced = (spec.refs ?? []).some(
            (reference) =>
                reference.table === dependency &&
                records.some((record) => !isBlank(record[reference.field])),
        );
        if (!referenced) continue;

        const journalled = await ctx.db
            .query("migrationRecords")
            .withIndex("by_table_batch", (q) => q.eq("table", dependency))
            .first();

        if (!journalled) {
            throw new ConvexError({
                code: "IMPORT_ORDER_VIOLATION",
                table: spec.table,
                missingDependency: dependency,
                hint: `import \`${dependency}\` (even an empty batch) before \`${spec.table}\``,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const importBatch = internalMutation({
    args: {
        migrationKey: v.string(),
        table: v.string(),
        batchIndex: v.number(),
        version: v.optional(v.string()),
        watermark: v.optional(v.string()),
        records: v.array(v.any()),
        sha256: v.string(),
        mode: v.optional(v.union(v.literal("insert"), v.literal("upsert"))),
    },
    handler: async (ctx, args): Promise<DomainImportBatchResult> => {
        assertMigrationKey(args.migrationKey);

        if (!isDomainImportTable(args.table)) {
            throw new ConvexError({ code: "UNKNOWN_IMPORT_TABLE", table: args.table });
        }

        const spec = SPEC_BY_TABLE.get(args.table);
        if (!spec) {
            // Declared in the order but with no spec: a plan/implementation
            // mismatch, not an operator error.
            throw new ConvexError({ code: "IMPORT_TABLE_NOT_IMPLEMENTED", table: args.table });
        }

        const records = args.records as Record<string, unknown>[];

        const digest = await domainBatchDigest({
            version: args.version,
            table: args.table,
            batchIndex: args.batchIndex,
            watermark: args.watermark,
            records,
        });

        if (digest !== args.sha256) {
            throw new ConvexError({
                code: "BATCH_DIGEST_MISMATCH",
                table: args.table,
                batchIndex: args.batchIndex,
                expected: args.sha256,
                computed: digest,
            });
        }

        const journalled = await ctx.db
            .query("migrationRecords")
            .withIndex("by_table_batch", (q) =>
                q.eq("table", args.table).eq("batchIndex", args.batchIndex),
            )
            .first();

        await assertDependenciesImported(ctx, spec, records);

        const outcome = await importRecords(ctx, spec, records, args.mode ?? "insert");

        await ctx.db.insert("migrationRecords", {
            table: args.table,
            batchIndex: args.batchIndex,
            sha256: digest,
            ...(args.version !== undefined ? { version: args.version } : {}),
            ...(args.watermark !== undefined ? { watermark: args.watermark } : {}),
            records: outcome.records,
            imported: outcome.imported,
            skipped: outcome.skipped,
            ...(outcome.updated > 0 ? { updated: outcome.updated } : {}),
            importedAt: Date.now(),
        });

        return {
            table: args.table,
            batchIndex: args.batchIndex,
            replayed: journalled !== null,
            digest,
            ...outcome,
        };
    },
});

/** Upper bound of one prune call: one transaction, bounded reads and writes. */
const PRUNE_BATCH_LIMIT = 200;

/**
 * `internal.migrations.domainImport.pruneBatch` (plan Task 16, delta import).
 *
 * Deletes the rows **this migration created** whose source row no longer
 * exists: a member removed, an event deleted between the full import and the
 * cutover. Without it a hard delete in the legacy would survive on the new
 * stack — for a membership, that is a removed person keeping access.
 *
 * Scope is deliberately narrow: lookup by `legacyId` only, so a row the
 * migration did not create can never be matched. The caller (`import-convex.ts`)
 * computes the orphans from the source's full id list and sends them in reverse
 * import order, children before parents. Convex-only tables that point at a
 * pruned row (`inviteTestRequests`, `organizationLimitOverrides`) are not
 * cascaded here: before the cutover the target has no such rows.
 */
export const pruneBatch = internalMutation({
    args: {
        migrationKey: v.string(),
        table: v.string(),
        legacyIds: v.array(v.string()),
    },
    handler: async (ctx, args): Promise<{ table: string; deleted: number; missing: number }> => {
        assertMigrationKey(args.migrationKey);

        if (!isDomainImportTable(args.table)) {
            throw new ConvexError({ code: "UNKNOWN_IMPORT_TABLE", table: args.table });
        }
        if (args.legacyIds.length > PRUNE_BATCH_LIMIT) {
            throw new ConvexError({ code: "PRUNE_BATCH_TOO_LARGE", limit: PRUNE_BATCH_LIMIT });
        }

        let deleted = 0;
        let missing = 0;
        for (const legacyId of args.legacyIds) {
            const id = legacyId ? await findById(ctx, args.table, legacyId) : null;
            if (!id) {
                missing += 1;
                continue;
            }
            await ctx.db.delete(id as never);
            deleted += 1;
        }

        return { table: args.table, deleted, missing };
    },
});
