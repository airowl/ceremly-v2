/**
 * Shared types of the migration pipeline (plan Task 16).
 *
 * `MigrationBatch<T>`, `ReconciliationResult` and `MigrationGateStatus` are the
 * binding names of the plan's "Interfacce condivise" block: every script under
 * `scripts/migration/` and every test under `test/migration/` uses these, never a
 * local copy.
 */

/** Version of the batch envelope (plan "Interfacce condivise"). */
export const MIGRATION_BATCH_VERSION = "2026-09-15" as const;

export type MigrationGateStatus = "NOT_RUN" | "PASS" | "FAIL";

export interface MigrationBatch<T> {
    version: typeof MIGRATION_BATCH_VERSION;
    table: string;
    watermark: string;
    batchIndex: number;
    records: T[];
    sha256: string;
}

export interface ReconciliationResult {
    table: string;
    sourceCount: number;
    targetCount: number;
    sourceChecksum: string;
    targetChecksum: string;
    mismatches: string[];
}

/**
 * `production` — business data that must survive the cutover.
 * `ephemeral` — data whose loss is harmless by design (sessions, tokens, counters).
 * `regenerable` — data the new stack rebuilds on its own (caches, journals, jobs).
 */
export type DataClass = "production" | "ephemeral" | "regenerable";

/**
 * What the pipeline does with a table.
 *
 * `imported` — exported, encrypted, imported and reconciled.
 * `not-imported` — deliberately left behind; `reason` says why.
 * `manifest-only` — the bytes stay where they are (R2); only a manifest of
 * keys/sizes/digests crosses, and reconcile checks it.
 * `target-only` — exists only in Convex; nothing to export.
 */
export type Disposition = "imported" | "not-imported" | "manifest-only" | "target-only";

export interface InventoryEntry {
    /** Source table (Neon) or target-only table (Convex), or a non-table store. */
    table: string;
    location: "neon" | "convex" | "r2" | "redis";
    dataClass: DataClass;
    disposition: Disposition;
    /** Where the data lands: Convex table, component table, or `—`. */
    destination: string;
    reason: string;
    count?: number;
    checksum?: string;
}

export type ExportMode = "full" | "delta";

export interface ManifestBatchFile {
    file: string;
    batchIndex: number;
    records: number;
    /** SHA-256 of the encrypted file bytes (what is on disk). */
    fileSha256: string;
    /** `MigrationBatch.sha256`: digest of the canonical plaintext payload. */
    payloadSha256: string;
}

export interface ManifestTable {
    /** Source table name (Neon). */
    source: string;
    /** Batch table name as the importer knows it. */
    table: string;
    dataClass: DataClass;
    disposition: Disposition;
    /** Rows in the source at the watermark. */
    sourceCount: number;
    /** Canonical checksum of every source row at the watermark. */
    sourceChecksum: string;
    /** Rows written to this bundle (all of them in `full`, the changed ones in `delta`). */
    exportedCount: number;
    batches: ManifestBatchFile[];
    /** Encrypted list of every source primary key (delta only: drives the prune). */
    idsFile?: { file: string; fileSha256: string; count: number };
}

export interface ExportManifest {
    format: "CEREMLY-MIGRATION-V1";
    version: typeof MIGRATION_BATCH_VERSION;
    mode: ExportMode;
    /** Database clock at the snapshot (the `now()` of the export transaction). */
    watermark: string;
    /** Previous watermark a delta was cut from (`null` for a full export). */
    since: string | null;
    /** Drizzle journal rows applied on the source: the schema the rows follow. */
    schemaVersion: { migrations: number; lastHash: string | null };
    /** Endpoint id only (never the URL): proves which branch was read. */
    sourceEndpoint: string;
    createdAt: string;
    tables: ManifestTable[];
    /** HMAC-SHA256 of the canonical manifest (HKDF-derived from the migration key). */
    mac: string;
}

/** Plaintext of a delta id list: bound to its table and watermark. */
export interface IdsPayload {
    version: typeof MIGRATION_BATCH_VERSION;
    table: string;
    watermark: string;
    ids: string[];
}
