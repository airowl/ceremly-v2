import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { encryptJson, sha256Bytes } from "../../scripts/migration/crypto";
import { exportSnapshot, SOURCE_TABLES, type SourceSnapshot } from "../../scripts/migration/export-neon";
import { loadBundle } from "../../scripts/migration/import-convex";
import { signManifest } from "../../scripts/migration/manifest";
import type { ExportManifest } from "../../scripts/migration/types";

/**
 * Task 16 fix round 1: a bundle is trusted as a whole or not at all. The
 * manifest is authenticated, the inventory is complete, and an id list can only
 * drive the prune of the table and watermark it was cut for.
 */

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function snapshot(): SourceSnapshot {
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const { source } of SOURCE_TABLES) tables[source] = [];
    tables.organization = [{ id: "org-1", name: "A", slug: "a", createdAt: "2026-01-01T00:00:00.000Z" }];
    tables.member = [{ id: "m-1", organizationId: "org-1", userId: "u-1", role: "owner", createdAt: "2026-01-01T00:00:00.000Z" }];
    return {
        watermark: "2026-09-24T10:00:00.000Z",
        schemaVersion: { migrations: 12, lastHash: "h" },
        sourceEndpoint: "ep-test",
        schemaDrift: {},
        tables,
    };
}

async function exportTo(mode: "full" | "delta", key: Buffer) {
    const dir = mkdtempSync(join(tmpdir(), "ceremly-bundle-"));
    dirs.push(dir);
    await exportSnapshot(snapshot(), { out: dir, mode, since: mode === "delta" ? "2026-09-24T09:00:00.000Z" : null }, key);
    return dir;
}

const readManifest = (dir: string) => JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as ExportManifest;
const writeManifest = (dir: string, manifest: ExportManifest) =>
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));

describe("loadBundle", () => {
    it("loads a full and a delta bundle it produced", async () => {
        const key = randomBytes(32);
        const full = await loadBundle(await exportTo("full", key), key);
        expect(full.batches.get("organizations")?.[0]?.records).toHaveLength(1);

        const delta = await loadBundle(await exportTo("delta", key), key);
        expect(delta.ids.get("memberships")).toEqual(["m-1"]);
    });

    it("refuses a manifest edited without the key", async () => {
        const key = randomBytes(32);
        const dir = await exportTo("full", key);
        const manifest = readManifest(dir);
        manifest.tables = manifest.tables.filter((table) => table.table !== "auditLogs");
        writeManifest(dir, manifest);

        await expect(loadBundle(dir, key)).rejects.toThrow(/Manifest authentication failed/);
    });

    it("refuses an incomplete inventory even when correctly signed", async () => {
        const key = randomBytes(32);
        const dir = await exportTo("full", key);
        const { mac: _mac, ...manifest } = readManifest(dir);
        writeManifest(dir, signManifest({ ...manifest, tables: manifest.tables.filter((table) => table.table !== "auditLogs") }, key));

        await expect(loadBundle(dir, key)).rejects.toThrow(/table auditLogs is missing/);
    });

    it("refuses a gap in batch indexes and a delta without its id lists", async () => {
        const key = randomBytes(32);
        const full = await exportTo("full", key);
        const { mac: _m1, ...fullManifest } = readManifest(full);
        const gapped = fullManifest.tables.map((table) =>
            table.table === "organizations" ? { ...table, batches: table.batches.map((batch) => ({ ...batch, batchIndex: 1 })) } : table,
        );
        writeManifest(full, signManifest({ ...fullManifest, tables: gapped }, key));
        await expect(loadBundle(full, key)).rejects.toThrow(/not contiguous/);

        const delta = await exportTo("delta", key);
        const { mac: _m2, ...deltaManifest } = readManifest(delta);
        const stripped = deltaManifest.tables.map((table) => (table.table === "memberships" ? { ...table, idsFile: undefined } : table));
        writeManifest(delta, signManifest({ ...deltaManifest, tables: stripped }, key));
        await expect(loadBundle(delta, key)).rejects.toThrow(/delta without its id list/);
    });

    it("refuses an id list moved to another table, even with a re-signed manifest", async () => {
        const key = randomBytes(32);
        const dir = await exportTo("delta", key);
        // `organizations` ids (["org-1"]) placed where `memberships` ids belong:
        // the prune would otherwise delete every membership not named "org-1".
        cpSync(join(dir, "organizations.ids.enc"), join(dir, "memberships.ids.enc"));
        const { mac: _mac, ...manifest } = readManifest(dir);
        const swapped = manifest.tables.map((table) =>
            table.table === "memberships"
                ? { ...table, idsFile: { ...table.idsFile!, fileSha256: sha256Bytes(readFileSync(join(dir, "memberships.ids.enc"))) } }
                : table,
        );
        writeManifest(dir, signManifest({ ...manifest, tables: swapped }, key));

        await expect(loadBundle(dir, key)).rejects.toThrow(/does not belong to this table and watermark/);
    });

    it("refuses a plain id array (pre-fix format)", async () => {
        const key = randomBytes(32);
        const dir = await exportTo("delta", key);
        const bytes = encryptJson(["m-1"], key);
        writeFileSync(join(dir, "memberships.ids.enc"), bytes);
        const { mac: _mac, ...manifest } = readManifest(dir);
        const patched = manifest.tables.map((table) =>
            table.table === "memberships" ? { ...table, idsFile: { ...table.idsFile!, fileSha256: sha256Bytes(bytes) } } : table,
        );
        writeManifest(dir, signManifest({ ...manifest, tables: patched }, key));

        await expect(loadBundle(dir, key)).rejects.toThrow(/does not belong/);
    });
});
