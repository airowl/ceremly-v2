import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import * as schema from "../../server/database/schema";
import { canonicalJson } from "../../shared/migration/bridgeProtocol";
import { encryptJson, migrationKeyFromEnv, sealBatch, sha256Bytes } from "./crypto";
import { inventoryEntryFor } from "./inventory";
import { signManifest } from "./manifest";
import type { ExportManifest, ExportMode, IdsPayload, ManifestTable, MigrationBatch } from "./types";
import { MIGRATION_BATCH_VERSION } from "./types";

/**
 * Plan Task 16, Step 3 — encrypted export of the legacy Neon database.
 *
 * One read-only `REPEATABLE READ` transaction reads every table, ordered by
 * primary key, so all tables describe the same instant: the transaction's
 * `now()` is the **watermark**. Rows are serialized to canonical JSON (ISO
 * timestamps), cut into batches of at most 100 records, sealed with their
 * digest, encrypted immediately and the plaintext buffer zeroed
 * (`Buffer.fill(0)` inside `encryptJson`). Nothing plaintext touches disk: the
 * only clear-text file is the manifest, which holds counts and digests.
 *
 * `--mode delta --since <watermark>` writes only the rows changed since a
 * previous export (plus the full id list of every table, encrypted, which drives
 * the prune of rows deleted in the source). The full tables are still read, so
 * the manifest's per-table checksum always describes the whole source.
 *
 * Usage (dev branch; `.env` only — this script never reads `.env.prod`):
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/export-neon.ts --out .migration-rehearsal/full-1
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/export-neon.ts --out .migration-rehearsal/delta-1 \
 *     --mode delta --since 2026-09-24T10:00:00.000Z
 */

/** The production endpoint. Reading it requires an explicit confirmation (Task 17). */
export const PRODUCTION_ENDPOINT_PREFIX = "ep-dark-dream";

/** Records per batch (plan Step 3). */
export const BATCH_SIZE = 100;
/** Upper bound of one batch's JSON: one mutation argument, well under Convex's limits. */
export const BATCH_MAX_BYTES = 350_000;
/**
 * Rows touched shortly before the previous watermark may have committed after
 * its snapshot (application clocks are not the database clock), so a delta
 * re-reads a margin. The import is idempotent, so the overlap is free.
 */
export const DELTA_OVERLAP_MS = 10 * 60 * 1000;

export interface SourceTable {
    /** Postgres table name. */
    source: string;
    table: PgTable;
    /** Batch tables written for it (importer names). */
    batchTables: readonly string[];
    /**
     * Column that moves when a row changes; `null` means the table has no such
     * column and is re-sent whole in a delta (small tables only). `createdAt` is
     * used only for append-only tables.
     */
    deltaColumn: "updatedAt" | "createdAt" | null;
}

/**
 * Every legacy table the export reads. `verification` is absent on purpose
 * (ephemeral, never imported); sessions live in Redis, not in Postgres. The
 * auth tables are always re-sent whole: the credential import resolves a user's
 * accounts inside one call, so an account cannot travel without its user.
 */
export const SOURCE_TABLES: readonly SourceTable[] = [
    { source: "user", table: schema.user, batchTables: ["auth_user", "appUsers"], deltaColumn: null },
    { source: "account", table: schema.account, batchTables: ["auth_account"], deltaColumn: null },
    { source: "two_factor", table: schema.twoFactor, batchTables: ["auth_two_factor"], deltaColumn: null },
    { source: "organization", table: schema.organization, batchTables: ["organizations"], deltaColumn: null },
    { source: "member", table: schema.member, batchTables: ["memberships"], deltaColumn: null },
    { source: "invitation", table: schema.invitation, batchTables: ["invitations"], deltaColumn: null },
    { source: "events", table: schema.events, batchTables: ["events"], deltaColumn: "updatedAt" },
    { source: "projects", table: schema.projects, batchTables: ["projects"], deltaColumn: "updatedAt" },
    { source: "guests", table: schema.guests, batchTables: ["guests"], deltaColumn: "updatedAt" },
    { source: "event_reminders", table: schema.eventReminders, batchTables: ["eventReminders"], deltaColumn: "updatedAt" },
    { source: "rsvp_responses", table: schema.rsvpResponses, batchTables: ["rsvpResponses"], deltaColumn: "updatedAt" },
    { source: "guest_activities", table: schema.guestActivities, batchTables: ["guestActivities"], deltaColumn: "createdAt" },
    { source: "file", table: schema.file, batchTables: ["files"], deltaColumn: "updatedAt" },
    { source: "email_suppressions", table: schema.emailSuppressions, batchTables: ["emailSuppressions"], deltaColumn: null },
    { source: "email_events", table: schema.emailEvents, batchTables: ["emailEvents"], deltaColumn: "createdAt" },
    { source: "data_exports", table: schema.dataExports, batchTables: ["dataExports"], deltaColumn: null },
    { source: "audit_log", table: schema.auditLog, batchTables: ["auditLogs"], deltaColumn: "createdAt" },
    { source: "contact_messages", table: schema.contactMessages, batchTables: ["contactMessages"], deltaColumn: null },
    { source: "waiting_list", table: schema.waitingList, batchTables: ["waitingList"], deltaColumn: null },
    // Imported into the Creem component (`migrations/billingImport`, fix round 1),
    // where `billing.planForActiveOrganization` reads the plan from.
    { source: "creem_subscription", table: schema.creem_subscription, batchTables: ["creem_subscription"], deltaColumn: null },
];

export type SourceRecord = Record<string, unknown>;

/**
 * Columns the Drizzle schema declares but the source database does not have
 * (a migration never applied), and the reverse. Measured, never assumed: the
 * dev branch was found without `0011_reliability_guards` applied.
 */
export type SchemaDrift = Record<string, { missingInDb: string[]; extraInDb: string[] }>;

export interface SourceSnapshot {
    watermark: string;
    schemaVersion: { migrations: number; lastHash: string | null };
    sourceEndpoint: string;
    schemaDrift: SchemaDrift;
    /** Canonical JSON rows (ISO timestamps), by Postgres table name, ordered by id. */
    tables: Record<string, SourceRecord[]>;
}

/** Every batch table the exporter writes → its source table (manifest validation). */
export const EXPECTED_BATCH_TABLES: ReadonlyMap<string, string> = new Map(
    SOURCE_TABLES.flatMap((source) => source.batchTables.map((table) => [table, source.source] as const)),
);

/** Endpoint id of a Neon URL (`ep-…`), never the URL. */
export function endpointOf(databaseUrl: string): string {
    try {
        return new URL(databaseUrl).hostname.split(".")[0]!.replace(/-pooler$/, "");
    } catch {
        return "unknown";
    }
}

/**
 * Loads `.env` (dev) and returns the source URL, refusing the production
 * endpoint unless `MIGRATION_SOURCE_CONFIRM` repeats its endpoint id.
 */
export function sourceDatabaseUrl(): string {
    config({ path: ".env", quiet: true });
    const url = process.env.NUXT_DATABASE_URL;
    if (!url) throw new Error("NUXT_DATABASE_URL is not set");

    const endpoint = endpointOf(url);
    if (endpoint.startsWith(PRODUCTION_ENDPOINT_PREFIX) && process.env.MIGRATION_SOURCE_CONFIRM !== endpoint) {
        throw new Error(
            `Refusing to read the production endpoint ${endpoint}: set MIGRATION_SOURCE_CONFIRM=${endpoint} (cutover only)`,
        );
    }
    return url;
}

/** Canonical checksum of a table's rows (sorted by id, keys sorted). */
export function tableChecksum(rows: readonly SourceRecord[]): string {
    const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return sha256Bytes(canonicalJson(sorted));
}

/**
 * Maps a raw row (database column names) to the Drizzle property names the
 * importer expects, converting through each column's own driver mapping
 * (timestamp text → `Date`). A column the database has but the schema does not
 * know keeps its database name, so the importer reports it as `unknownColumns`
 * instead of it vanishing.
 */
function mapRow(table: PgTable, raw: Record<string, unknown>): SourceRecord {
    const { columns } = getTableConfig(table);
    const byDbName = new Map(columns.map((column) => [column.name, column]));
    const row: SourceRecord = {};

    for (const [dbName, value] of Object.entries(raw)) {
        const column = byDbName.get(dbName);
        if (!column) {
            row[dbName] = value;
            continue;
        }
        const property = Object.entries(table).find(([, candidate]) => candidate === column)?.[0] ?? dbName;
        row[property] = value === null || value === undefined ? null : column.mapFromDriverValue(value);
    }

    return row;
}

/**
 * Reads every source table inside one read-only REPEATABLE READ transaction
 * (Neon HTTP `transaction()`), so the snapshot is consistent across tables.
 *
 * `SELECT *` rather than the Drizzle column list: the export copies what the
 * database holds, and a schema/database mismatch is reported (`schemaDrift`)
 * instead of failing the read or silently dropping a column.
 */
export async function readSourceSnapshot(databaseUrl = sourceDatabaseUrl()): Promise<SourceSnapshot> {
    const client = neon(databaseUrl, { isolationLevel: "RepeatableRead", readOnly: true, fullResults: true });
    // Constructing the Drizzle driver installs its type parsers (timestamps stay
    // text, so `mapFromDriverValue` decides how to read them, as the app does).
    drizzle({ client, schema });

    const results = await client.transaction([
        client.query(`
            select now() as watermark,
                   (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
                   (select hash from drizzle.__drizzle_migrations order by created_at desc limit 1) as last_hash`),
        client.query(
            "select table_name, column_name from information_schema.columns where table_schema = 'public'",
        ),
        ...SOURCE_TABLES.map(({ source }) => client.query(`select * from "${source}" order by "id"`)),
    ]);

    const [metaResult, columnsResult, ...tableResults] = results as unknown as Array<{
        rows: Array<Record<string, unknown>>;
    }>;
    const metaRow = metaResult!.rows[0]!;

    const dbColumns = new Map<string, Set<string>>();
    for (const { table_name: table, column_name: column } of columnsResult!.rows) {
        if (!dbColumns.has(String(table))) dbColumns.set(String(table), new Set());
        dbColumns.get(String(table))!.add(String(column));
    }

    const tables: Record<string, SourceRecord[]> = {};
    const schemaDrift: SchemaDrift = {};

    for (const [index, { source, table }] of SOURCE_TABLES.entries()) {
        const declared = getTableConfig(table).columns.map((column) => column.name);
        const actual = dbColumns.get(source) ?? new Set<string>();
        const missingInDb = declared.filter((column) => !actual.has(column));
        const extraInDb = [...actual].filter((column) => !declared.includes(column)).sort();
        if (missingInDb.length > 0 || extraInDb.length > 0) schemaDrift[source] = { missingInDb, extraInDb };

        // JSON round trip: `Date` → ISO string, the wire shape the importer and
        // the digest see.
        const rows = tableResults[index]!.rows.map((raw) => mapRow(table, raw));
        tables[source] = JSON.parse(JSON.stringify(rows)) as SourceRecord[];
    }

    const watermarkRaw = String(metaRow.watermark);
    const watermark = new Date(watermarkRaw.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).toISOString();

    return {
        watermark,
        schemaVersion: {
            migrations: Number(metaRow.migrations ?? 0),
            lastHash: (metaRow.last_hash as string | null) ?? null,
        },
        sourceEndpoint: endpointOf(databaseUrl),
        schemaDrift,
        tables,
    };
}

/** Cuts records into batches of ≤ `BATCH_SIZE` records and ≤ `BATCH_MAX_BYTES` of JSON. */
export function cutBatches<T>(records: readonly T[]): T[][] {
    const batches: T[][] = [];
    let current: T[] = [];
    let bytes = 0;

    for (const record of records) {
        const size = Buffer.byteLength(JSON.stringify(record), "utf8");
        if (current.length > 0 && (current.length >= BATCH_SIZE || bytes + size > BATCH_MAX_BYTES)) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(record);
        bytes += size;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

/** Rows a delta must carry for a table. */
export function deltaRows(source: SourceTable, rows: readonly SourceRecord[], since: string): SourceRecord[] {
    if (source.deltaColumn === null) return [...rows];

    const threshold = Date.parse(since) - DELTA_OVERLAP_MS;
    return rows.filter((row) => {
        const value = row[source.deltaColumn!] ?? row.createdAt;
        // A row with no timestamp cannot prove it is unchanged: send it.
        if (value === null || value === undefined) return true;
        return Date.parse(String(value)) >= threshold;
    });
}

export interface ExportOptions {
    out: string;
    mode: ExportMode;
    since: string | null;
}

function parseArgs(argv: string[]): ExportOptions {
    const options: ExportOptions = { out: "", mode: "full", since: null };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--out") options.out = argv[++index] ?? "";
        else if (arg === "--mode") options.mode = (argv[++index] ?? "full") as ExportMode;
        else if (arg === "--since") options.since = argv[++index] ?? null;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!options.out) throw new Error("--out <dir> is required");
    if (options.mode !== "full" && options.mode !== "delta") throw new Error("--mode must be full or delta");
    if (options.mode === "delta" && (!options.since || Number.isNaN(Date.parse(options.since)))) {
        throw new Error("--mode delta needs --since <ISO watermark of the previous export>");
    }
    return options;
}

async function writeEncrypted(path: string, value: unknown, key: Buffer): Promise<string> {
    const bundle = encryptJson(value, key);
    await writeFile(path, bundle, { mode: 0o600 });
    return sha256Bytes(bundle);
}

export async function exportSnapshot(
    snapshot: SourceSnapshot,
    options: ExportOptions,
    key: Buffer,
): Promise<ExportManifest> {
    const outDir = resolve(options.out);
    await mkdir(outDir, { recursive: true, mode: 0o700 });

    const tables: ManifestTable[] = [];

    for (const source of SOURCE_TABLES) {
        const rows = snapshot.tables[source.source] ?? [];
        const exported = options.mode === "delta" ? deltaRows(source, rows, options.since!) : rows;
        const entry = inventoryEntryFor(source.source);

        for (const batchTable of source.batchTables) {
            // A full export sends an empty table too: the importer's journal row
            // is the proof that a prerequisite was handled (Task 10).
            const chunks = exported.length > 0 ? cutBatches(exported) : options.mode === "full" ? [[]] : [];
            const batches: ManifestTable["batches"] = [];

            for (const [batchIndex, records] of chunks.entries()) {
                const batch: MigrationBatch<SourceRecord> = sealBatch({
                    table: batchTable,
                    watermark: snapshot.watermark,
                    batchIndex,
                    records,
                });
                const file = `${batchTable}.batch-${String(batchIndex).padStart(4, "0")}.enc`;
                const fileSha256 = await writeEncrypted(join(outDir, file), batch, key);
                batches.push({ file, batchIndex, records: records.length, fileSha256, payloadSha256: batch.sha256 });
            }

            const manifestTable: ManifestTable = {
                source: source.source,
                table: batchTable,
                dataClass: entry.dataClass,
                disposition: "imported",
                sourceCount: rows.length,
                sourceChecksum: tableChecksum(rows),
                exportedCount: exported.length,
                batches,
            };

            if (options.mode === "delta") {
                const file = `${batchTable}.ids.enc`;
                // Bound to its table and watermark: a list moved to another table
                // (or taken from another export) fails to verify, so it can never
                // drive a prune it was not cut for.
                const payload: IdsPayload = {
                    version: MIGRATION_BATCH_VERSION,
                    table: batchTable,
                    watermark: snapshot.watermark,
                    ids: rows.map((row) => String(row.id)),
                };
                manifestTable.idsFile = {
                    file,
                    fileSha256: await writeEncrypted(join(outDir, file), payload, key),
                    count: payload.ids.length,
                };
            }

            tables.push(manifestTable);
        }
    }

    const manifest: ExportManifest = signManifest({
        format: "CEREMLY-MIGRATION-V1",
        version: MIGRATION_BATCH_VERSION,
        mode: options.mode,
        watermark: snapshot.watermark,
        since: options.since,
        schemaVersion: snapshot.schemaVersion,
        sourceEndpoint: snapshot.sourceEndpoint,
        createdAt: new Date().toISOString(),
        tables,
    }, key);
    await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return manifest;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const key = migrationKeyFromEnv();
    const started = Date.now();

    const snapshot = await readSourceSnapshot();
    const manifest = await exportSnapshot(snapshot, options, key);

    // Counts and digests only: never a row.
    console.log(JSON.stringify({
        out: resolve(options.out),
        mode: manifest.mode,
        watermark: manifest.watermark,
        since: manifest.since,
        sourceEndpoint: manifest.sourceEndpoint,
        schemaVersion: manifest.schemaVersion,
        files: manifest.tables.reduce((sum, table) => sum + table.batches.length + (table.idsFile ? 1 : 0), 0),
        exported: Object.fromEntries(manifest.tables.map((table) => [table.table, `${table.exportedCount}/${table.sourceCount}`])),
        elapsedMs: Date.now() - started,
    }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[export-neon] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
