import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { IMPORT_ORDER } from "../../shared/migration/domainBatch";
import { assertStagingTarget, readAllPages, runConvex } from "./convex-cli";
import { assertBatchDigest, decryptJson, migrationKeyFromEnv, sha256Bytes } from "./crypto";
import type { ExportManifest, MigrationBatch } from "./types";

/**
 * Plan Task 16, Step 4 — import of an encrypted export into Convex.
 *
 * 1. **Verify everything before the first write.** Every file's SHA-256 must
 *    match the manifest, its GCM tag must authenticate, the decrypted batch must
 *    match its own digest, table and index. One bad file and nothing is sent.
 * 2. **Credentials first** (`migrations/authImport:importBatch`, Task 4), users
 *    grouped with their accounts and 2FA rows — the import resolves a user's
 *    records inside one call.
 * 3. **Domain in topological order** (`migrations/domainImport:importBatch`,
 *    Task 10), the order the importer itself enforces.
 * 4. **Delta:** `upsert` mode (a row changed since the full import is rewritten)
 *    and a prune of migrated rows whose source row is gone, children first.
 *
 * Re-runnable: both importers are idempotent on natural keys, so a crashed run is
 * resumed by running it again. Output is counts only — never a row.
 *
 * `--verify-only` stops after step 1: the whole bundle is checked (digests, tags,
 * manifest agreement) and nothing is sent to the deployment.
 *
 * Usage:
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-1 --verify-only
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-1
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/delta-1
 */

type SourceRecord = Record<string, unknown>;

/** Users per credential call: each call is one Convex transaction. */
const AUTH_USERS_PER_CALL = 50;
/** Legacy ids per prune call (`pruneBatch` refuses more than 200). */
const PRUNE_CHUNK = 200;

interface VerifiedBundle {
    manifest: ExportManifest;
    /** Decrypted batches by batch table, in batch order. */
    batches: Map<string, MigrationBatch<SourceRecord>[]>;
    /** Delta only: every source id of a batch table. */
    ids: Map<string, string[]>;
}

async function readVerified(path: string, fileSha256: string): Promise<Buffer> {
    const bytes = await readFile(path);
    if (sha256Bytes(bytes) !== fileSha256) {
        throw new Error(`File digest mismatch: ${path} is not the file the manifest describes`);
    }
    return bytes;
}

/** Verifies and decrypts a whole bundle in memory. Throws before any write. */
export async function loadBundle(dir: string, key: Buffer): Promise<VerifiedBundle> {
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as ExportManifest;
    if (manifest.format !== "CEREMLY-MIGRATION-V1") throw new Error("Unknown manifest format");

    const batches = new Map<string, MigrationBatch<SourceRecord>[]>();
    const ids = new Map<string, string[]>();

    for (const table of manifest.tables) {
        const list: MigrationBatch<SourceRecord>[] = [];
        for (const entry of table.batches) {
            const bytes = await readVerified(join(dir, entry.file), entry.fileSha256);
            const batch = decryptJson<MigrationBatch<SourceRecord>>(bytes, key);
            assertBatchDigest(batch);
            if (
                batch.table !== table.table ||
                batch.batchIndex !== entry.batchIndex ||
                batch.sha256 !== entry.payloadSha256 ||
                batch.records.length !== entry.records ||
                batch.watermark !== manifest.watermark
            ) {
                throw new Error(`Batch ${entry.file} does not match its manifest entry`);
            }
            list.push(batch);
        }
        const exported = list.reduce((sum, batch) => sum + batch.records.length, 0);
        if (exported !== table.exportedCount) {
            throw new Error(`Table ${table.table}: ${exported} records in the files, ${table.exportedCount} in the manifest`);
        }
        batches.set(table.table, list);

        if (table.idsFile) {
            const bytes = await readVerified(join(dir, table.idsFile.file), table.idsFile.fileSha256);
            const list = decryptJson<string[]>(bytes, key);
            if (list.length !== table.idsFile.count) throw new Error(`Id list of ${table.table} is incomplete`);
            ids.set(table.table, list);
        }
    }

    return { manifest, batches, ids };
}

const recordsOf = (bundle: VerifiedBundle, table: string): SourceRecord[] =>
    (bundle.batches.get(table) ?? []).flatMap((batch) => batch.records);

/**
 * Groups credential records per user chunk. An account or 2FA row whose user is
 * not in the export is an orphan in the source and stops the import.
 */
export function groupAuthRecords(
    users: SourceRecord[],
    accounts: SourceRecord[],
    twoFactors: SourceRecord[],
    perCall = AUTH_USERS_PER_CALL,
): Array<{ users: SourceRecord[]; accounts: SourceRecord[]; twoFactors: SourceRecord[] }> {
    const chunkOf = new Map<string, number>();
    const groups: Array<{ users: SourceRecord[]; accounts: SourceRecord[]; twoFactors: SourceRecord[] }> = [];

    users.forEach((user, index) => {
        const chunk = Math.floor(index / perCall);
        groups[chunk] ??= { users: [], accounts: [], twoFactors: [] };
        groups[chunk]!.users.push(user);
        chunkOf.set(String(user.id), chunk);
    });

    const place = (rows: SourceRecord[], key: "accounts" | "twoFactors") => {
        for (const row of rows) {
            const chunk = chunkOf.get(String(row.userId));
            if (chunk === undefined) throw new Error(`Source ${key} row has no exported user (orphan in the source)`);
            groups[chunk]![key].push(row);
        }
    };
    place(accounts, "accounts");
    place(twoFactors, "twoFactors");
    return groups;
}

interface TableOutcome {
    table: string;
    batches: number;
    records: number;
    imported: number;
    skipped: number;
    updated: number;
    deferred: number;
    danglingRefs: number;
    unknownColumns: string[];
    pruned?: number;
}

interface DomainResult {
    imported: number;
    skipped: number;
    updated?: number;
    deferred: Record<string, number>;
    danglingRefs: unknown[];
    unknownColumns: string[];
}

interface AuthResult {
    imported: number;
    skipped: number;
    updated?: number;
    normalizedEmails: number;
}

async function main() {
    const bundleIndex = process.argv.indexOf("--bundle");
    const dir = bundleIndex > -1 ? resolve(process.argv[bundleIndex + 1] ?? "") : "";
    if (!dir) throw new Error("--bundle <dir> is required");
    const noPrune = process.argv.includes("--no-prune");
    const verifyOnly = process.argv.includes("--verify-only");

    if (verifyOnly) {
        const started = Date.now();
        const bundle = await loadBundle(dir, migrationKeyFromEnv());
        console.log(JSON.stringify({
            bundle: dir,
            verified: true,
            mode: bundle.manifest.mode,
            watermark: bundle.manifest.watermark,
            files: [...bundle.batches.values()].reduce((sum, list) => sum + list.length, 0) + bundle.ids.size,
            records: Object.fromEntries([...bundle.batches].map(([table, list]) => [table, list.reduce((sum, batch) => sum + batch.records.length, 0)])),
            verifyMs: Date.now() - started,
        }, null, 2));
        return;
    }

    config({ path: ".env", quiet: true });
    const migrationKey = process.env.NUXT_MIGRATION_API_KEY ?? "";
    if (!migrationKey) throw new Error("NUXT_MIGRATION_API_KEY is not set (the deployment's MIGRATION_API_KEY)");
    const deployment = assertStagingTarget();
    const key = migrationKeyFromEnv();

    const started = Date.now();
    const bundle = await loadBundle(dir, key);
    const verifyMs = Date.now() - started;
    const mode = bundle.manifest.mode === "delta" ? "upsert" : "insert";
    const outcomes: TableOutcome[] = [];

    // --- 1. credentials ------------------------------------------------------
    const authStarted = Date.now();
    const authGroups = groupAuthRecords(
        recordsOf(bundle, "auth_user"),
        recordsOf(bundle, "auth_account"),
        recordsOf(bundle, "auth_two_factor"),
    );
    const auth: TableOutcome = {
        table: "auth", batches: 0, records: 0, imported: 0, skipped: 0, updated: 0, deferred: 0, danglingRefs: 0, unknownColumns: [],
    };
    for (const group of authGroups) {
        const result = await runConvex<AuthResult>("migrations/authImport:importBatch", { migrationKey, ...group, mode });
        auth.batches += 1;
        auth.records += group.users.length + group.accounts.length + group.twoFactors.length;
        auth.imported += result.imported;
        auth.skipped += result.skipped;
        auth.updated += result.updated ?? 0;
    }
    outcomes.push(auth);
    const authMs = Date.now() - authStarted;

    // --- 2. domain, topological ----------------------------------------------
    const domainStarted = Date.now();
    for (const table of IMPORT_ORDER) {
        const outcome: TableOutcome = {
            table, batches: 0, records: 0, imported: 0, skipped: 0, updated: 0, deferred: 0, danglingRefs: 0, unknownColumns: [],
        };
        const unknown = new Set<string>();
        for (const batch of bundle.batches.get(table) ?? []) {
            const result = await runConvex<DomainResult>("migrations/domainImport:importBatch", {
                migrationKey,
                table,
                batchIndex: batch.batchIndex,
                version: batch.version,
                watermark: batch.watermark,
                records: batch.records,
                sha256: batch.sha256,
                mode,
            });
            outcome.batches += 1;
            outcome.records += batch.records.length;
            outcome.imported += result.imported;
            outcome.skipped += result.skipped;
            outcome.updated += result.updated ?? 0;
            outcome.deferred += Object.values(result.deferred).reduce((sum, count) => sum + count, 0);
            outcome.danglingRefs += result.danglingRefs.length;
            for (const column of result.unknownColumns) unknown.add(column);
        }
        outcome.unknownColumns = [...unknown].sort();
        outcomes.push(outcome);
    }
    const domainMs = Date.now() - domainStarted;

    // --- 3. delta prune, children first --------------------------------------
    const pruneStarted = Date.now();
    if (bundle.manifest.mode === "delta" && !noPrune) {
        for (const table of [...IMPORT_ORDER].reverse()) {
            const sourceIds = bundle.ids.get(table);
            if (!sourceIds) throw new Error(`Delta bundle has no id list for ${table}: refusing to guess deletions`);
            const keep = new Set(sourceIds);

            const target = await readAllPages<{ legacyId?: string }>("migrations/reconcileSnapshot:tablePage", {
                migrationKey,
                table,
            });
            const orphans = target.map((doc) => String(doc.legacyId)).filter((legacyId) => !keep.has(legacyId));

            let pruned = 0;
            for (let offset = 0; offset < orphans.length; offset += PRUNE_CHUNK) {
                const result = await runConvex<{ deleted: number }>("migrations/domainImport:pruneBatch", {
                    migrationKey,
                    table,
                    legacyIds: orphans.slice(offset, offset + PRUNE_CHUNK),
                });
                pruned += result.deleted;
            }
            const outcome = outcomes.find((candidate) => candidate.table === table);
            if (outcome) outcome.pruned = pruned;
        }
    }
    const pruneMs = Date.now() - pruneStarted;

    console.log(JSON.stringify({
        deployment,
        bundle: dir,
        manifestMode: bundle.manifest.mode,
        importMode: mode,
        watermark: bundle.manifest.watermark,
        tables: outcomes,
        timings: { verifyMs, authMs, domainMs, pruneMs, totalMs: Date.now() - started },
    }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[import-convex] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
