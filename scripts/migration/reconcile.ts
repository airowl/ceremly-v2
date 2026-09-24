import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeEmail } from "../../convex/lib/identity";
import { DOMAIN_IMPORT_SPECS, deferReason, type TableSpec } from "../../convex/migrations/domainImport";
import { canonicalJson } from "../../shared/migration/bridgeProtocol";
import { IMPORT_ORDER, type DomainImportTable } from "../../shared/migration/domainBatch";
import { CEREMLY_TIER_LIMITS, CREEM_PRODUCT_ENV } from "../../shared/constants/pricing";
import { sha256Bytes } from "./crypto";
import type { BucketObject } from "./r2-bucket";
import type { ExportManifest, ReconciliationResult } from "./types";
import {
    compareBillingStates,
    type ConvexBillingState,
    type LegacyBillingState,
    type LegacyOrganizationPlan,
    type ReconciliationReport,
} from "./reconcile-creem";

/**
 * Plan Task 16, Step 4 — reconciliation of the legacy source with the target.
 *
 * For every imported table: count and canonical checksum on both sides, every
 * row matched on its legacy id, every copied column compared, every logical
 * reference compared **as a legacy id** (a guest must point at the event whose
 * legacy id the source row carries, not merely at some event). Then the Better
 * Auth credentials (by digest), the R2 manifest (key, size, SHA-256 of each
 * file), plans (`events.tier`) and Creem (customers, subscriptions, orders,
 * via `reconcile-creem`). Exit code `1` on **any** mismatch — and on an empty
 * comparison, which proves nothing.
 *
 * The compared columns are read from the import's own declaration
 * (`DOMAIN_IMPORT_SPECS`), so the reconciliation cannot drift from what the
 * import copies. Mismatches name the table, the legacy id and the column —
 * never a value.
 */

export interface ProjectedRecord {
    legacyId: string;
    values: Record<string, unknown>;
}

export interface TableReconciliation extends ReconciliationResult {
    /** Source rows deliberately not imported (Task 10 deferrals). */
    deferred: number;
    /** Facts worth reading that are not failures (e.g. rows created on the new stack). */
    notes: string[];
}

type SourceRecord = Record<string, unknown>;
type TargetDoc = Record<string, unknown>;

const SPEC_BY_TABLE = new Map<string, TableSpec>(DOMAIN_IMPORT_SPECS.map((spec) => [spec.table, spec]));

const specFor = (table: DomainImportTable): TableSpec => {
    const spec = SPEC_BY_TABLE.get(table);
    if (!spec) throw new Error(`No import spec for ${table}`);
    return spec;
};

const isBlank = (value: unknown): boolean => value === null || value === undefined || value === "";

const epoch = (value: unknown): number | undefined => {
    if (isBlank(value)) return undefined;
    if (typeof value === "number") return value;
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? undefined : parsed;
};

export function canonicalChecksum(records: readonly ProjectedRecord[]): string {
    const sorted = [...records].sort((a, b) => a.legacyId.localeCompare(b.legacyId));
    return sha256Bytes(canonicalJson(sorted));
}

/** SHA-256 of a credential string, the same digest `reconcileSnapshot.authPage` computes. */
export function sha256Secret(value: string): string {
    return sha256Bytes(Buffer.from(value, "utf8"));
}

const secretDigest = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? sha256Secret(value) : null;

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------

/** Columns derived by the import that are still a function of the source row. */
function computedValues(table: DomainImportTable, spec: TableSpec, record: SourceRecord): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    if (spec.computed?.includes("email") && typeof record.email === "string" && record.email) {
        values.email = normalizeEmail(record.email);
    }
    if (table === "appUsers") {
        values.globalRole = record.role === "superAdmin" ? "superAdmin" : "user";
        values.locale = typeof record.locale === "string" && record.locale ? record.locale : "it";
    }
    return values;
}

function projectSource(
    table: DomainImportTable,
    record: SourceRecord,
    sourceIdsOf?: (table: DomainImportTable) => Set<string> | undefined,
): ProjectedRecord {
    const spec = specFor(table);
    const values: Record<string, unknown> = {};

    // Same rule as the import: a column is copied when it is neither null nor absent.
    for (const field of spec.fields) {
        if (record[field] !== null && record[field] !== undefined) values[spec.rename?.[field] ?? field] = record[field];
    }
    for (const field of spec.timestamps ?? []) {
        const value = epoch(record[field]);
        if (value !== undefined) values[field] = value;
    }
    for (const reference of spec.refs ?? []) {
        const raw = record[reference.field];
        if (isBlank(raw)) continue;
        // A best-effort reference to a parent that does not exist in the source
        // is dropped by the import (counted in `danglingRefs`): expect it absent.
        const parents = sourceIdsOf?.(reference.table);
        if (reference.mode === "best-effort" && parents && !parents.has(String(raw))) continue;
        values[reference.as ?? reference.field] = String(raw);
    }
    Object.assign(values, computedValues(table, spec, record));

    return { legacyId: String(record.id), values };
}

function projectTarget(
    table: DomainImportTable,
    doc: TargetDoc,
    legacyIdOf: (convexId: string) => string | undefined,
): { record: ProjectedRecord; dangling: string[] } {
    const spec = specFor(table);
    const values: Record<string, unknown> = {};
    const dangling: string[] = [];

    for (const field of spec.fields) {
        const key = spec.rename?.[field] ?? field;
        if (doc[key] !== null && doc[key] !== undefined) values[key] = doc[key];
    }
    for (const field of spec.timestamps ?? []) {
        if (doc[field] !== null && doc[field] !== undefined) values[field] = doc[field];
    }
    for (const reference of spec.refs ?? []) {
        const key = reference.as ?? reference.field;
        if (isBlank(doc[key])) continue;
        const legacyId = legacyIdOf(String(doc[key]));
        if (legacyId === undefined) {
            dangling.push(key);
            continue;
        }
        values[key] = legacyId;
    }
    if (spec.computed?.includes("email") && typeof doc.email === "string") values.email = doc.email;
    if (table === "appUsers") {
        values.globalRole = doc.globalRole;
        values.locale = doc.locale;
    }

    return { record: { legacyId: String(doc.legacyId), values }, dangling };
}

/** Compares two projections of one table. Subjects are legacy ids and column names. */
function compareProjections(
    table: string,
    source: readonly ProjectedRecord[],
    target: readonly ProjectedRecord[],
    extra: { dangling?: Map<string, string[]>; deferred?: number; notes?: string[] } = {},
): TableReconciliation {
    const mismatches: string[] = [];
    const targetById = new Map(target.map((record) => [record.legacyId, record]));
    const sourceIds = new Set(source.map((record) => record.legacyId));

    for (const record of source) {
        const twin = targetById.get(record.legacyId);
        if (!twin) {
            mismatches.push(`missing_in_target:${record.legacyId}`);
            continue;
        }
        const columns = new Set([...Object.keys(record.values), ...Object.keys(twin.values)]);
        for (const column of [...columns].sort()) {
            if (canonicalJson(record.values[column] ?? null) !== canonicalJson(twin.values[column] ?? null)) {
                mismatches.push(`field_mismatch:${record.legacyId}:${column}`);
            }
        }
        for (const column of extra.dangling?.get(record.legacyId) ?? []) {
            mismatches.push(`dangling_ref:${record.legacyId}:${column}`);
        }
    }
    for (const record of target) {
        if (!sourceIds.has(record.legacyId)) mismatches.push(`orphan_in_target:${record.legacyId}`);
    }

    return {
        table,
        sourceCount: source.length,
        targetCount: target.length,
        sourceChecksum: canonicalChecksum(source),
        targetChecksum: canonicalChecksum(target),
        mismatches,
        deferred: extra.deferred ?? 0,
        notes: extra.notes ?? [],
    };
}

export function reconcileDomainTable(
    table: DomainImportTable,
    sourceRecords: readonly SourceRecord[],
    targetDocs: readonly TargetDoc[],
    legacyIdOf: (convexId: string) => string | undefined,
    sourceIdsOf?: (table: DomainImportTable) => Set<string> | undefined,
): TableReconciliation {
    let deferred = 0;
    const source: ProjectedRecord[] = [];
    for (const record of sourceRecords) {
        if (deferReason(table, record)) {
            deferred += 1;
            continue;
        }
        source.push(projectSource(table, record, sourceIdsOf));
    }

    const dangling = new Map<string, string[]>();
    const target: ProjectedRecord[] = [];
    for (const doc of targetDocs) {
        // Rows the new stack created itself are out of scope by definition.
        if (isBlank(doc.legacyId)) continue;
        const projected = projectTarget(table, doc, legacyIdOf);
        target.push(projected.record);
        if (projected.dangling.length > 0) dangling.set(projected.record.legacyId, projected.dangling);
    }

    return compareProjections(table, source, target, { dangling, deferred });
}

/**
 * R2 manifest: the object bytes are not migrated, so what must agree is the
 * key, the size and the SHA-256 each file row points at.
 */
export function reconcileR2Manifest(
    sourceFiles: readonly SourceRecord[],
    targetFiles: readonly TargetDoc[],
): TableReconciliation {
    const pick = (legacyId: unknown, row: Record<string, unknown>): ProjectedRecord => ({
        legacyId: String(legacyId),
        values: { path: row.path ?? null, size: row.size ?? null, sha256: row.sha256 ?? null },
    });
    const source = sourceFiles.filter((row) => !deferReason("files", row)).map((row) => pick(row.id, row));
    const target = targetFiles.filter((doc) => !isBlank(doc.legacyId)).map((doc) => pick(doc.legacyId, doc));
    const deferred = sourceFiles.length - source.length;

    return compareProjections("r2_objects", source, target, {
        deferred,
        notes: ["bucket HEAD per key not performed: same bucket, keys unchanged; object existence is a Task 17 check"],
    });
}

/** Key prefixes the file service writes (`evt/<id>/…`, `global/…`). */
export const FILE_NAMESPACES = ["evt/", "global/"] as const;

const inFileNamespace = (key: string): boolean => FILE_NAMESPACES.some((prefix) => key.startsWith(prefix));

/**
 * The bucket itself (fix round 1): every file row must point at an object that
 * exists with the recorded size, and every object in the file namespace must
 * belong to a row. Keys are reported hashed: a key can embed an original file
 * name. ETags are not compared — the rows carry SHA-256, R2's ETag is an MD5
 * (or a multipart digest), so the two are not the same function.
 */
export function reconcileR2Bucket(
    sourceFiles: readonly SourceRecord[],
    objects: readonly BucketObject[],
): TableReconciliation {
    const keyDigest = (key: string) => sha256Bytes(key).slice(0, 16);
    const expected = sourceFiles
        .filter((row) => !deferReason("files", row) && typeof row.path === "string" && row.path.length > 0)
        .map((row) => ({ legacyId: String(row.id), key: String(row.path), size: Number(row.size) }));
    const inScope = objects.filter((object) => inFileNamespace(object.key));
    const objectByKey = new Map(inScope.map((object) => [object.key, object]));
    const expectedKeys = new Set(expected.map((entry) => entry.key));

    const mismatches: string[] = [];
    for (const entry of expected) {
        const object = objectByKey.get(entry.key);
        if (!object) mismatches.push(`missing_object:${entry.legacyId}`);
        else if (object.size !== entry.size) mismatches.push(`size_mismatch:${entry.legacyId}`);
    }
    for (const object of inScope) {
        if (!expectedKeys.has(object.key)) mismatches.push(`extra_object:${keyDigest(object.key)}`);
    }

    const digest = (entries: Array<{ key: string; size: number }>) =>
        sha256Bytes(canonicalJson([...entries].map(({ key, size }) => ({ key, size })).sort((a, b) => a.key.localeCompare(b.key))));

    return {
        table: "r2_bucket",
        sourceCount: expected.length,
        targetCount: inScope.length,
        sourceChecksum: digest(expected),
        targetChecksum: digest(inScope),
        mismatches,
        deferred: sourceFiles.length - expected.length,
        notes: [
            `objects_outside_file_namespace:${objects.length - inScope.length}`,
            "etag_not_compared:rows_carry_sha256",
        ],
    };
}

// ---------------------------------------------------------------------------
// Auth (Better Auth component)
// ---------------------------------------------------------------------------

export interface AuthSourceState {
    users: SourceRecord[];
    accounts: SourceRecord[];
    twoFactors: SourceRecord[];
}

export interface AuthTargetState {
    users: Array<{
        id: string;
        email: string | null;
        name: string | null;
        emailVerified: boolean | null;
        twoFactorEnabled: boolean | null;
        createdAt: number | string | null;
    }>;
    accounts: Array<{
        userId: string;
        providerId: string | null;
        accountId: string | null;
        passwordSha256?: string | null;
        accessTokenSha256?: string | null;
        refreshTokenSha256?: string | null;
        idTokenSha256?: string | null;
        scope?: string | null;
    }>;
    twoFactors: Array<{ userId: string; secretSha256: string | null; backupCodesSha256: string | null }>;
}

/**
 * Credentials are matched on the natural keys Better Auth enforces (email,
 * `(providerId, accountId)`, one 2FA row per user) and compared by digest. The
 * component carries no legacy id, so a target-only row cannot be told apart from
 * a sign-up on the new stack: it is a note, not a mismatch.
 */
export function reconcileAuth(source: AuthSourceState, target: AuthTargetState): TableReconciliation[] {
    const legacyUserByEmail = new Map<string, string>();
    for (const user of source.users) legacyUserByEmail.set(normalizeEmail(String(user.email)), String(user.id));

    const targetEmailById = new Map<string, string>();
    for (const user of target.users) {
        if (user.email) targetEmailById.set(user.id, normalizeEmail(user.email));
    }
    /** Target auth user id → legacy user id (through the email). */
    const ownerOf = (targetUserId: string): string | null => {
        const email = targetEmailById.get(targetUserId);
        return email ? (legacyUserByEmail.get(email) ?? null) : null;
    };

    // Users ------------------------------------------------------------------
    const sourceUsers = source.users.map((user) => ({
        legacyId: String(user.id),
        values: {
            name: user.name ?? null,
            emailVerified: Boolean(user.emailVerified),
            twoFactorEnabled: user.twoFactorEnabled ?? null,
            createdAt: epoch(user.createdAt) ?? null,
        },
    }));
    const targetUsers: ProjectedRecord[] = [];
    let usersOnlyInTarget = 0;
    for (const user of target.users) {
        const legacyId = user.email ? legacyUserByEmail.get(normalizeEmail(user.email)) : undefined;
        if (!legacyId) {
            usersOnlyInTarget += 1;
            continue;
        }
        targetUsers.push({
            legacyId,
            values: {
                name: user.name ?? null,
                emailVerified: Boolean(user.emailVerified),
                twoFactorEnabled: user.twoFactorEnabled ?? null,
                createdAt: epoch(user.createdAt) ?? null,
            },
        });
    }

    // Accounts ---------------------------------------------------------------
    const accountKey = (providerId: unknown, accountId: unknown) => `${String(providerId)}:${String(accountId)}`;
    const legacyAccountByKey = new Map<string, string>();
    const sourceAccounts = source.accounts.map((account) => {
        legacyAccountByKey.set(accountKey(account.providerId, account.accountId), String(account.id));
        return {
            legacyId: String(account.id),
            values: {
                owner: String(account.userId),
                passwordSha256: secretDigest(account.password),
                accessTokenSha256: secretDigest(account.accessToken),
                refreshTokenSha256: secretDigest(account.refreshToken),
                idTokenSha256: secretDigest(account.idToken),
                scope: account.scope ?? null,
            },
        };
    });
    const targetAccounts: ProjectedRecord[] = [];
    let accountsOnlyInTarget = 0;
    for (const account of target.accounts) {
        const legacyId = legacyAccountByKey.get(accountKey(account.providerId, account.accountId));
        if (!legacyId) {
            accountsOnlyInTarget += 1;
            continue;
        }
        targetAccounts.push({
            legacyId,
            values: {
                owner: ownerOf(account.userId),
                passwordSha256: account.passwordSha256 ?? null,
                accessTokenSha256: account.accessTokenSha256 ?? null,
                refreshTokenSha256: account.refreshTokenSha256 ?? null,
                idTokenSha256: account.idTokenSha256 ?? null,
                scope: account.scope ?? null,
            },
        });
    }

    // 2FA --------------------------------------------------------------------
    const legacyTwoFactorByOwner = new Map<string, string>();
    const sourceTwoFactors = source.twoFactors.map((row) => {
        legacyTwoFactorByOwner.set(String(row.userId), String(row.id));
        return {
            legacyId: String(row.id),
            values: {
                owner: String(row.userId),
                secretSha256: secretDigest(row.secret),
                backupCodesSha256: secretDigest(row.backupCodes),
            },
        };
    });
    const targetTwoFactors: ProjectedRecord[] = [];
    let twoFactorsOnlyInTarget = 0;
    for (const row of target.twoFactors) {
        const owner = ownerOf(row.userId);
        const legacyId = owner ? legacyTwoFactorByOwner.get(owner) : undefined;
        if (!legacyId) {
            twoFactorsOnlyInTarget += 1;
            continue;
        }
        targetTwoFactors.push({
            legacyId,
            values: { owner, secretSha256: row.secretSha256 ?? null, backupCodesSha256: row.backupCodesSha256 ?? null },
        });
    }

    const note = (count: number) => (count > 0 ? [`only_in_target:${count}`] : []);
    return [
        compareProjections("auth_user", sourceUsers, targetUsers, { notes: note(usersOnlyInTarget) }),
        compareProjections("auth_account", sourceAccounts, targetAccounts, { notes: note(accountsOnlyInTarget) }),
        compareProjections("auth_two_factor", sourceTwoFactors, targetTwoFactors, { notes: note(twoFactorsOnlyInTarget) }),
    ].map((result) => ({
        ...result,
        // "Orphan" is meaningless without a legacy id on the target side.
        mismatches: result.mismatches.filter((mismatch) => !mismatch.startsWith("orphan_in_target:")),
    }));
}

// ---------------------------------------------------------------------------
// Manifest, billing, verdict
// ---------------------------------------------------------------------------

/**
 * The live source must still be the snapshot the export described: a table
 * whose count or checksum moved after the watermark means writes happened
 * during the maintenance window, and the imported data is already stale.
 */
export function reconcileManifest(
    manifest: ExportManifest,
    live: Record<string, { count: number; checksum: string }>,
): TableReconciliation {
    const mismatches: string[] = [];
    const bySource = new Map<string, { count: number; checksum: string }>();
    for (const table of manifest.tables) bySource.set(table.source, { count: table.sourceCount, checksum: table.sourceChecksum });

    for (const [source, expected] of [...bySource].sort(([a], [b]) => a.localeCompare(b))) {
        const current = live[source];
        if (!current) {
            mismatches.push(`source_table_missing:${source}`);
        } else if (current.count !== expected.count || current.checksum !== expected.checksum) {
            mismatches.push(`source_changed_after_export:${source}`);
        }
    }

    const digest = (entries: Array<[string, { count: number; checksum: string }]>) =>
        sha256Bytes(canonicalJson(entries.sort(([a], [b]) => a.localeCompare(b))));

    return {
        table: "source_manifest",
        sourceCount: [...bySource.values()].reduce((sum, entry) => sum + entry.count, 0),
        targetCount: [...bySource.keys()].reduce((sum, source) => sum + (live[source]?.count ?? 0), 0),
        sourceChecksum: digest([...bySource]),
        targetChecksum: digest([...bySource.keys()].filter((source) => live[source]).map((source) => [source, live[source]!])),
        mismatches,
        deferred: 0,
        notes: [`watermark:${manifest.watermark}`, `mode:${manifest.mode}`],
    };
}

/** Wraps the Task 6 comparator: every Creem mismatch fails the reconciliation. */
export function reconcileBilling(report: ReconciliationReport): TableReconciliation {
    // Facts (products, subscriptions, events, per-org plans) are compared on
    // their own keys; counts and digests cover the legacy facts and the ones
    // found on Convex, so a missing fact moves both.
    const legacy = [...report.facts.legacy].sort();
    const matched = [...report.facts.matched].sort();
    return {
        table: "creem_billing",
        sourceCount: legacy.length,
        targetCount: matched.length,
        sourceChecksum: sha256Bytes(canonicalJson(legacy)),
        targetChecksum: sha256Bytes(canonicalJson(matched)),
        mismatches: report.mismatches.map((mismatch) => `${mismatch.kind}:${mismatch.subject}`),
        deferred: 0,
        notes: report.notes.map((note) => `${note.kind}:${note.subject}`),
    };
}

/**
 * `1` on any mismatch, on a count or checksum that differs between the two
 * sides (fix round 1: a difference is a failure even when no row-level mismatch
 * explains it), and on an empty comparison (nothing proven).
 */
export function reconciliationExitCode(results: readonly ReconciliationResult[]): 0 | 1 {
    if (results.length === 0) return 1;
    return results.some(
        (result) =>
            result.mismatches.length > 0 ||
            result.sourceCount !== result.targetCount ||
            result.sourceChecksum !== result.targetChecksum,
    )
        ? 1
        : 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Legacy product configuration (`NUXT_CREEM_PRODUCT_ID_*`). */
export function legacyProductsFromEnv(env: NodeJS.ProcessEnv): Array<{ tier: string; productId: string }> {
    return Object.entries(CREEM_PRODUCT_ENV.legacy).flatMap(([tier, name]) =>
        env[name] ? [{ tier, productId: String(env[name]) }] : [],
    );
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * The legacy billing state with the legacy rules: a subscription belongs to the
 * paying **user** (`referenceId`), an organization's plan is its owner's
 * (`planLimit.service.ts` → `resolveOrgOwnerId`: the `owner` member, else the
 * first member), and Atelier needs an active subscription to the Atelier product
 * when one is configured. Limits are the legacy's own table
 * (`shared/constants/pricing.ts`), not the Convex mirror.
 */
export function legacyBillingState(
    tables: Record<string, SourceRecord[]>,
    products: Array<{ tier: string; productId: string }> = [],
): LegacyBillingState {
    const members = tables.member ?? [];
    const organizationIds = new Set((tables.organization ?? []).map((row) => String(row.id)));
    const ownedBy = new Map<string, string[]>();
    const ownerOf = new Map<string, string>();
    for (const organizationId of organizationIds) {
        const orgMembers = members.filter((member) => String(member.organizationId) === organizationId);
        const owner = orgMembers.find((member) => member.role === "owner") ?? orgMembers[0];
        if (!owner) continue;
        ownerOf.set(organizationId, String(owner.userId));
    }
    for (const member of members) {
        if (member.role !== "owner") continue;
        const list = ownedBy.get(String(member.userId)) ?? [];
        list.push(String(member.organizationId));
        ownedBy.set(String(member.userId), list);
    }

    const subscriptions = tables.creem_subscription ?? [];
    const atelierProduct = products.find((product) => product.tier === "atelier")?.productId ?? null;
    const organizations: LegacyOrganizationPlan[] = [...organizationIds].sort().map((legacyId) => {
        const owner = ownerOf.get(legacyId);
        const own = subscriptions.filter((row) => owner !== undefined && String(row.referenceId) === owner);
        const atelier = own.some(
            (row) =>
                ACTIVE_STATUSES.has(String(row.status ?? "")) &&
                (atelierProduct === null || String(row.productId) === atelierProduct),
        );
        const plan = atelier ? "atelier" : "free";
        const limits = CEREMLY_TIER_LIMITS[plan];
        return {
            legacyId,
            plan,
            limits: { maxGuestsPerEvent: limits.maxGuestsPerEvent, maxActiveEvents: limits.maxActiveEvents, maxReminders: limits.maxReminders },
            customerIds: [...new Set(own.map((row) => row.creemCustomerId).filter((id): id is string => typeof id === "string" && id.length > 0))],
        };
    });

    return {
        products,
        organizations,
        subscriptions: subscriptions.map((row) => ({
            organizationLegacyIds: organizationIds.has(String(row.referenceId))
                ? [String(row.referenceId)]
                : (ownedBy.get(String(row.referenceId)) ?? []).sort(),
            creemSubscriptionId: (row.creemSubscriptionId as string | null) ?? null,
            referenceId: String(row.referenceId),
            productId: String(row.productId),
            status: (row.status as string | null) ?? "pending",
            creemCustomerId: (row.creemCustomerId as string | null) ?? null,
            creemOrderId: (row.creemOrderId as string | null) ?? null,
            periodEnd: (row.periodEnd as string | null) ?? null,
            cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
        })),
        events: (tables.events ?? []).map((row) => ({
            legacyId: String(row.id),
            organizationLegacyId: String(row.organizationId),
            tier: String(row.tier),
            creemOrderId: (row.creemOrderId as string | null) ?? null,
            creemCheckoutId: (row.creemCheckoutId as string | null) ?? null,
        })),
    };
}

/** Postgres table that feeds each domain table. */
export const SOURCE_OF: Record<DomainImportTable, string> = {
    appUsers: "user",
    organizations: "organization",
    memberships: "member",
    invitations: "invitation",
    events: "events",
    projects: "projects",
    guests: "guests",
    eventReminders: "event_reminders",
    rsvpResponses: "rsvp_responses",
    guestActivities: "guest_activities",
    files: "file",
    emailSuppressions: "email_suppressions",
    emailEvents: "email_events",
    dataExports: "data_exports",
    auditLogs: "audit_log",
    contactMessages: "contact_messages",
    waitingList: "waiting_list",
};

interface CliOptions {
    manifest: string | null;
    out: string | null;
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { manifest: null, out: null };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--manifest") options.manifest = argv[++index] ?? null;
        else if (arg === "--out") options.out = argv[++index] ?? null;
        // Production gate flags (Task 17): consumed by `connectTarget`.
        else if (arg === "--production") continue;
        else if (arg === "--confirm-deployment" || arg === "--preflight-report") index += 1;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function main() {
    const { config } = await import("dotenv");
    const { readSourceSnapshot, tableChecksum } = await import("./export-neon");
    const { connectTarget } = await import("./convex-target");
    const { listAllObjects, r2ListerFromEnv } = await import("./r2-bucket");
    const { migrationKeyFromEnv } = await import("./crypto");
    const { verifyManifestMac, validateManifest } = await import("./manifest");
    const { EXPECTED_BATCH_TABLES } = await import("./export-neon");

    const options = parseArgs(process.argv.slice(2));
    config({ path: ".env", quiet: true });
    const migrationKey = process.env.NUXT_MIGRATION_API_KEY ?? "";
    if (!migrationKey) throw new Error("NUXT_MIGRATION_API_KEY is not set (the deployment's MIGRATION_API_KEY)");

    // The manifest is trusted only once its MAC verifies.
    let manifest: ExportManifest | null = null;
    if (options.manifest) {
        manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8")) as ExportManifest;
        verifyManifestMac(manifest, migrationKeyFromEnv());
        validateManifest(manifest, EXPECTED_BATCH_TABLES);
    }

    const target = await connectTarget(process.argv.slice(2));
    const deployment = target.deployment;
    const lister = r2ListerFromEnv(process.env);
    const started = Date.now();

    // Source and target are read concurrently: the source is one consistent
    // snapshot, the target one paginated read per table.
    const [snapshot, targetTables, authUsers, authAccounts, authTwoFactors, billing, bucket] = await Promise.all([
        readSourceSnapshot(),
        Promise.all(
            IMPORT_ORDER.map((table) =>
                target.readAllPages<TargetDoc>("migrations/reconcileSnapshot:tablePage", { migrationKey, table }),
            ),
        ),
        target.readAllPages<AuthTargetState["users"][number]>("migrations/reconcileSnapshot:authPage", { migrationKey, model: "user" }),
        target.readAllPages<AuthTargetState["accounts"][number]>("migrations/reconcileSnapshot:authPage", { migrationKey, model: "account" }),
        target.readAllPages<AuthTargetState["twoFactors"][number]>("migrations/reconcileSnapshot:authPage", { migrationKey, model: "twoFactor" }),
        target.run<ConvexBillingState>("billing:reconcileSnapshot", {}),
        lister ? listAllObjects(lister) : Promise.resolve(null),
    ]);
    const readMs = Date.now() - started;

    const legacyIds = new Map<string, string>();
    const targetByTable = new Map<DomainImportTable, TargetDoc[]>();
    for (const [index, table] of IMPORT_ORDER.entries()) {
        const docs = targetTables[index]!;
        targetByTable.set(table, docs);
        for (const doc of docs) legacyIds.set(String(doc._id), String(doc.legacyId));
    }

    const sourceIds = new Map<DomainImportTable, Set<string>>();
    for (const table of IMPORT_ORDER) {
        sourceIds.set(table, new Set((snapshot.tables[SOURCE_OF[table]] ?? []).map((row) => String(row.id))));
    }

    const results: TableReconciliation[] = [];
    for (const table of IMPORT_ORDER) {
        results.push(
            reconcileDomainTable(
                table,
                snapshot.tables[SOURCE_OF[table]] ?? [],
                targetByTable.get(table) ?? [],
                (id) => legacyIds.get(id),
                (parent) => sourceIds.get(parent),
            ),
        );
    }
    results.push(
        ...reconcileAuth(
            {
                users: snapshot.tables.user ?? [],
                accounts: snapshot.tables.account ?? [],
                twoFactors: snapshot.tables.two_factor ?? [],
            },
            { users: authUsers, accounts: authAccounts, twoFactors: authTwoFactors },
        ),
    );
    results.push(reconcileR2Manifest(snapshot.tables.file ?? [], targetByTable.get("files") ?? []));
    if (bucket) {
        results.push(reconcileR2Bucket(snapshot.tables.file ?? [], bucket));
    } else {
        // Fail closed: a reconciliation that could not look at the bucket has
        // not proven the objects exist.
        results.push({
            table: "r2_bucket", sourceCount: 0, targetCount: 0, sourceChecksum: "-", targetChecksum: "-",
            mismatches: ["bucket_not_inventoried:no_r2_read_credentials"], deferred: 0, notes: [],
        });
    }
    results.push(
        reconcileBilling(
            compareBillingStates(legacyBillingState(snapshot.tables, legacyProductsFromEnv(process.env)), billing),
        ),
    );

    if (manifest) {
        const live = Object.fromEntries(
            Object.entries(snapshot.tables).map(([table, rows]) => [table, { count: rows.length, checksum: tableChecksum(rows) }]),
        );
        results.push(reconcileManifest(manifest, live));
    }

    const exitCode = reconciliationExitCode(results);
    const report = {
        generatedAt: new Date().toISOString(),
        deployment,
        sourceEndpoint: snapshot.sourceEndpoint,
        sourceWatermark: snapshot.watermark,
        schemaDrift: snapshot.schemaDrift,
        verdict: exitCode === 0 ? "PASS" : "FAIL",
        timings: { readMs, totalMs: Date.now() - started },
        results,
    };

    if (options.out) {
        await mkdir(dirname(resolve(options.out)), { recursive: true });
        await writeFile(resolve(options.out), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    }

    // Summary: counts, checksum prefixes, mismatch counts. Full list in --out.
    for (const result of results) {
        const same = result.sourceChecksum === result.targetChecksum ? "=" : "≠";
        console.log(
            `${result.table.padEnd(20)} src=${String(result.sourceCount).padStart(4)} tgt=${String(result.targetCount).padStart(4)} ` +
            `${result.sourceChecksum.slice(0, 12)} ${same} ${result.targetChecksum.slice(0, 12)} ` +
            `mismatches=${result.mismatches.length}${result.deferred ? ` deferred=${result.deferred}` : ""}` +
            `${result.mismatches.length ? ` [${result.mismatches.slice(0, 5).join(", ")}${result.mismatches.length > 5 ? ", …" : ""}]` : ""}`,
        );
    }
    console.log(`verdict=${report.verdict} exit=${exitCode} totalMs=${report.timings.totalMs}${options.out ? ` report=${join(options.out)}` : ""}`);
    process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[reconcile] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
