import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "../../shared/migration/bridgeProtocol";
import type { ExportManifest, IdsPayload } from "./types";
import { MIGRATION_BATCH_VERSION } from "./types";

/**
 * Manifest authentication and validation (Task 16, fix round 1).
 *
 * The manifest is the only clear-text file of a bundle, and it is what tells
 * the importer which ciphertext belongs to which table. Unauthenticated, it can
 * be edited: a valid id list from another table swapped in (the prune would then
 * delete legitimate rows), a table removed (a partial import that looks whole).
 * So:
 *
 * - the manifest carries an HMAC-SHA256 over its canonical JSON, keyed with a
 *   key derived (HKDF) from the migration key — separate from the encryption
 *   key, verified in constant time before anything else is read;
 * - every id list is encrypted as `{version, table, watermark, ids}` and checked
 *   against the table and watermark it is used for;
 * - the inventory is validated as a whole (exact table set, no duplicates,
 *   contiguous batch indexes, delta id lists everywhere) before the first write.
 */

const MAC_INFO = "ceremly-migration/manifest-mac/v1";

function macKey(key: Buffer): Buffer {
    return Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), MAC_INFO, 32));
}

const unsigned = (manifest: ExportManifest): Omit<ExportManifest, "mac"> => {
    const { mac: _mac, ...rest } = manifest;
    return rest;
};

export function manifestMac(manifest: Omit<ExportManifest, "mac"> | ExportManifest, key: Buffer): string {
    return createHmac("sha256", macKey(key))
        .update(canonicalJson(unsigned(manifest as ExportManifest)))
        .digest("hex");
}

export function signManifest(manifest: Omit<ExportManifest, "mac">, key: Buffer): ExportManifest {
    return { ...manifest, mac: manifestMac(manifest, key) };
}

export function verifyManifestMac(manifest: ExportManifest, key: Buffer): void {
    const expected = Buffer.from(manifestMac(manifest, key), "hex");
    const actual = Buffer.from(typeof manifest.mac === "string" ? manifest.mac : "", "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error("Manifest authentication failed: it was edited, or was signed with another key");
    }
}

/** Throws unless the decrypted id list is the one for `table` at `watermark`. */
export function assertIdsPayload(payload: IdsPayload, table: string, watermark: string, count: number): string[] {
    if (
        payload?.version !== MIGRATION_BATCH_VERSION ||
        payload.table !== table ||
        payload.watermark !== watermark ||
        !Array.isArray(payload.ids) ||
        payload.ids.length !== count ||
        payload.ids.some((id) => typeof id !== "string")
    ) {
        throw new Error(`Id list for ${table} does not belong to this table and watermark`);
    }
    if (new Set(payload.ids).size !== payload.ids.length) {
        throw new Error(`Id list for ${table} has duplicates`);
    }
    return payload.ids;
}

/**
 * Validates the whole inventory of a (MAC-verified) manifest against the tables
 * the exporter must produce. `expected` maps each batch table to its source.
 */
export function validateManifest(manifest: ExportManifest, expected: ReadonlyMap<string, string>): void {
    const fail = (reason: string): never => {
        throw new Error(`Invalid manifest: ${reason}`);
    };

    if (manifest.format !== "CEREMLY-MIGRATION-V1") fail("unknown format");
    if (manifest.version !== MIGRATION_BATCH_VERSION) fail(`unsupported version ${String(manifest.version)}`);
    if (manifest.mode !== "full" && manifest.mode !== "delta") fail("mode must be full or delta");
    if (Number.isNaN(Date.parse(manifest.watermark))) fail("watermark is not a date");
    if (manifest.mode === "delta") {
        if (!manifest.since || Number.isNaN(Date.parse(manifest.since))) fail("delta without `since`");
        if (Date.parse(manifest.since!) > Date.parse(manifest.watermark)) fail("`since` is after the watermark");
    }

    const seen = new Set<string>();
    for (const table of manifest.tables) {
        if (seen.has(table.table)) fail(`table ${table.table} listed twice`);
        seen.add(table.table);

        const source = expected.get(table.table);
        if (source === undefined) fail(`unexpected table ${table.table}`);
        if (table.source !== source) fail(`table ${table.table} claims source ${table.source}`);

        const files = new Set<string>();
        let records = 0;
        table.batches.forEach((batch, index) => {
            if (batch.batchIndex !== index) fail(`${table.table}: batch indexes are not contiguous`);
            if (batch.file !== `${table.table}.batch-${String(index).padStart(4, "0")}.enc`) {
                fail(`${table.table}: unexpected file name ${batch.file}`);
            }
            if (files.has(batch.file)) fail(`${table.table}: duplicate file ${batch.file}`);
            files.add(batch.file);
            if (!Number.isInteger(batch.records) || batch.records < 0) fail(`${table.table}: bad record count`);
            records += batch.records;
        });
        if (records !== table.exportedCount) fail(`${table.table}: batches hold ${records}, manifest says ${table.exportedCount}`);

        if (manifest.mode === "full") {
            if (table.batches.length === 0) fail(`${table.table}: a full export sends every table, even empty`);
            if (table.exportedCount !== table.sourceCount) fail(`${table.table}: full export is partial`);
        } else {
            if (table.exportedCount > table.sourceCount) fail(`${table.table}: more exported than exist`);
            if (!table.idsFile) fail(`${table.table}: delta without its id list`);
            if (table.idsFile!.file !== `${table.table}.ids.enc`) fail(`${table.table}: unexpected id list file`);
            if (table.idsFile!.count !== table.sourceCount) fail(`${table.table}: id list count ≠ source count`);
        }
    }

    for (const table of expected.keys()) {
        if (!seen.has(table)) fail(`table ${table} is missing`);
    }
}
