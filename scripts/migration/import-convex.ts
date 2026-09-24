import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { IMPORT_ORDER } from "../../shared/migration/domainBatch";
import { connectTarget, type ConvexTarget } from "./convex-target";
import { assertBatchDigest, decryptJson, migrationKeyFromEnv, sha256Bytes } from "./crypto";
import { EXPECTED_BATCH_TABLES } from "./export-neon";
import { assertIdsPayload, validateManifest, verifyManifestMac } from "./manifest";
import type { ExportManifest, IdsPayload, MigrationBatch } from "./types";

/**
 * Plan Task 16, Step 4 — import of an encrypted export into Convex.
 *
 * 1. **Verify everything before the first write.** The manifest's HMAC, then the
 *    whole inventory (exact table set, contiguous batches, delta id lists), then
 *    every file: SHA-256 against the manifest, GCM tag, the batch's own digest,
 *    table/index/watermark, and each id list bound to its table and watermark.
 *    One bad file and nothing is sent.
 * 2. **Credentials first** (`migrations/authImport:importBatch`, Task 4), users
 *    grouped with their accounts and 2FA rows.
 * 3. **Domain in topological order** (`migrations/domainImport:importBatch`).
 * 4. **Billing** (`migrations/billingImport:importBatch`): legacy subscriptions
 *    into the Creem component, once organizations and memberships exist.
 * 5. **Delta:** `upsert` mode and a prune of migrated rows whose source row is
 *    gone, children first.
 *
 * Every call goes over HTTPS to the deployment `.env.local` names, verified as a
 * dev deployment (`convex-target.ts`): no child process, nothing in argv.
 * Re-runnable: the importers are idempotent on natural keys. Output is counts only.
 *
 * Usage:
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-1 --verify-only
 *   MIGRATION_ENCRYPTION_KEY=... npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-1
 */

type SourceRecord = Record<string, unknown>;

/** Users per credential call: each call is one Convex transaction. */
const AUTH_USERS_PER_CALL = 50;
/** Legacy ids per prune call (`pruneBatch` refuses more than 200). */
const PRUNE_CHUNK = 200;

export interface VerifiedBundle {
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
export async function loadBundle(
    dir: string,
    key: Buffer,
    expected: ReadonlyMap<string, string> = EXPECTED_BATCH_TABLES,
): Promise<VerifiedBundle> {
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as ExportManifest;
    verifyManifestMac(manifest, key);
    validateManifest(manifest, expected);

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
        batches.set(table.table, list);

        if (table.idsFile) {
            const bytes = await readVerified(join(dir, table.idsFile.file), table.idsFile.fileSha256);
            const payload = decryptJson<IdsPayload>(bytes, key);
            ids.set(table.table, assertIdsPayload(payload, table.table, manifest.watermark, table.idsFile.count));
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
}

const emptyOutcome = (table: string): TableOutcome => ({
    table, batches: 0, records: 0, imported: 0, skipped: 0, updated: 0, deferred: 0, danglingRefs: 0, unknownColumns: [],
});

export async function importBundle(target: ConvexTarget, bundle: VerifiedBundle, migrationKey: string, options: { prune: boolean }) {
    const mode = bundle.manifest.mode === "delta" ? "upsert" : "insert";
    const outcomes: TableOutcome[] = [];
    const timings: Record<string, number> = {};

    // --- 1. credentials ------------------------------------------------------
    let started = Date.now();
    const auth = emptyOutcome("auth");
    for (const group of groupAuthRecords(
        recordsOf(bundle, "auth_user"),
        recordsOf(bundle, "auth_account"),
        recordsOf(bundle, "auth_two_factor"),
    )) {
        const result = await target.run<AuthResult>("migrations/authImport:importBatch", { migrationKey, ...group, mode });
        auth.batches += 1;
        auth.records += group.users.length + group.accounts.length + group.twoFactors.length;
        auth.imported += result.imported;
        auth.skipped += result.skipped;
        auth.updated += result.updated ?? 0;
    }
    outcomes.push(auth);
    timings.authMs = Date.now() - started;

    // --- 2. domain, topological ----------------------------------------------
    started = Date.now();
    for (const table of IMPORT_ORDER) {
        const outcome = emptyOutcome(table);
        const unknown = new Set<string>();
        for (const batch of bundle.batches.get(table) ?? []) {
            const result = await target.run<DomainResult>("migrations/domainImport:importBatch", {
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
    timings.domainMs = Date.now() - started;

    // --- 3. billing (Creem component) ----------------------------------------
    started = Date.now();
    const billing = emptyOutcome("creem_subscription");
    for (const batch of bundle.batches.get("creem_subscription") ?? []) {
        const result = await target.run<{ imported: number; skipped: number; deferred: Record<string, number> }>(
            "migrations/billingImport:importBatch",
            {
                migrationKey,
                batchIndex: batch.batchIndex,
                version: batch.version,
                watermark: batch.watermark,
                records: batch.records,
                sha256: batch.sha256,
            },
        );
        billing.batches += 1;
        billing.records += batch.records.length;
        billing.imported += result.imported;
        billing.skipped += result.skipped;
        billing.deferred += Object.values(result.deferred).reduce((sum, count) => sum + count, 0);
    }
    outcomes.push(billing);
    timings.billingMs = Date.now() - started;

    // --- 4. delta prune, children first --------------------------------------
    started = Date.now();
    if (bundle.manifest.mode === "delta" && options.prune) {
        for (const table of [...IMPORT_ORDER].reverse()) {
            const sourceIds = bundle.ids.get(table);
            if (!sourceIds) throw new Error(`Delta bundle has no id list for ${table}: refusing to guess deletions`);
            const keep = new Set(sourceIds);

            const current = await target.readAllPages<{ legacyId?: string }>("migrations/reconcileSnapshot:tablePage", {
                migrationKey,
                table,
            });
            const orphans = current.map((doc) => String(doc.legacyId)).filter((legacyId) => !keep.has(legacyId));

            let pruned = 0;
            for (let offset = 0; offset < orphans.length; offset += PRUNE_CHUNK) {
                const result = await target.run<{ deleted: number }>("migrations/domainImport:pruneBatch", {
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
    timings.pruneMs = Date.now() - started;

    return { importMode: mode, tables: outcomes, timings };
}

async function main() {
    const bundleIndex = process.argv.indexOf("--bundle");
    const dir = bundleIndex > -1 ? resolve(process.argv[bundleIndex + 1] ?? "") : "";
    if (!dir) throw new Error("--bundle <dir> is required");
    const prune = !process.argv.includes("--no-prune");
    const verifyOnly = process.argv.includes("--verify-only");

    const started = Date.now();
    const bundle = await loadBundle(dir, migrationKeyFromEnv());
    const verifyMs = Date.now() - started;

    if (verifyOnly) {
        console.log(JSON.stringify({
            bundle: dir,
            verified: true,
            mode: bundle.manifest.mode,
            watermark: bundle.manifest.watermark,
            files: [...bundle.batches.values()].reduce((sum, list) => sum + list.length, 0) + bundle.ids.size,
            records: Object.fromEntries([...bundle.batches].map(([table, list]) => [table, list.reduce((sum, batch) => sum + batch.records.length, 0)])),
            verifyMs,
        }, null, 2));
        return;
    }

    config({ path: ".env", quiet: true });
    const migrationKey = process.env.NUXT_MIGRATION_API_KEY ?? "";
    if (!migrationKey) throw new Error("NUXT_MIGRATION_API_KEY is not set (the deployment's MIGRATION_API_KEY)");
    const target = await connectTarget(process.argv.slice(2));

    const result = await importBundle(target, bundle, migrationKey, { prune });
    console.log(JSON.stringify({
        deployment: target.deployment,
        bundle: dir,
        manifestMode: bundle.manifest.mode,
        watermark: bundle.manifest.watermark,
        ...result,
        timings: { verifyMs, ...result.timings, totalMs: Date.now() - started },
    }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[import-convex] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
