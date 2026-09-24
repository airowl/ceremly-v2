import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    BUNDLE_MAGIC,
    decryptBundle,
    decryptJson,
    encryptBundle,
    encryptJson,
    migrationBatchDigest,
    parseMigrationKey,
    sealBatch,
    sha256Bytes,
} from "../../scripts/migration/crypto";
import { MIGRATION_BATCH_VERSION, type MigrationBatch } from "../../scripts/migration/types";

/**
 * Plan Task 16, Step 1: authenticated encryption of the migration bundles.
 *
 * File format (binding): magic `CEREMLY-MIGRATION-V1`, 12-byte IV, 16-byte GCM
 * auth tag, ciphertext. The four properties the plan asks for — round trip,
 * wrong key, altered byte, no plaintext in the file — are each a case here.
 */

const key = () => randomBytes(32);

const SECRET_MARKERS = ["$scrypt$hash-of-a-password", "JBSWY3DPEHPK3PXP", "guest@example.com"];

const sampleBatch = (): MigrationBatch<Record<string, unknown>> =>
    sealBatch({
        table: "guests",
        watermark: "2026-09-24T10:00:00.000Z",
        batchIndex: 0,
        records: [
            { id: "g-1", email: SECRET_MARKERS[2], password: SECRET_MARKERS[0], secret: SECRET_MARKERS[1] },
            { id: "g-2", createdAt: "2026-09-01T00:00:00.000Z", blocks: [{ type: "hero", title: "Ciao" }] },
        ],
    });

describe("migration bundle format", () => {
    it("writes magic, 12-byte IV, 16-byte tag, then ciphertext", () => {
        const plaintext = Buffer.from("hello bundle", "utf8");
        const bundle = encryptBundle(plaintext, key());

        expect(BUNDLE_MAGIC.toString("utf8")).toBe("CEREMLY-MIGRATION-V1");
        expect(bundle.subarray(0, BUNDLE_MAGIC.length).equals(BUNDLE_MAGIC)).toBe(true);
        // AES-GCM is a stream mode: ciphertext length equals plaintext length.
        expect(bundle.length).toBe(BUNDLE_MAGIC.length + 12 + 16 + plaintext.length);
    });

    it("round-trips a batch", () => {
        const k = key();
        const batch = sampleBatch();
        const bundle = encryptJson(batch, k);

        expect(decryptJson<typeof batch>(bundle, k)).toEqual(batch);
    });

    it("uses a fresh IV per bundle, so equal payloads never produce equal files", () => {
        const k = key();
        const batch = sampleBatch();

        expect(encryptJson(batch, k).equals(encryptJson(batch, k))).toBe(false);
    });

    it("refuses the wrong key", () => {
        const bundle = encryptJson(sampleBatch(), key());

        expect(() => decryptJson(bundle, key())).toThrow();
    });

    it("refuses any altered byte: magic, IV, tag and ciphertext", () => {
        const k = key();
        const bundle = encryptJson(sampleBatch(), k);
        const offsets = [0, BUNDLE_MAGIC.length, BUNDLE_MAGIC.length + 12, BUNDLE_MAGIC.length + 28, bundle.length - 1];

        for (const offset of offsets) {
            const altered = Buffer.from(bundle);
            altered[offset] = altered[offset]! ^ 0x01;
            expect(() => decryptBundle(altered, k), `byte ${offset}`).toThrow();
        }
    });

    it("refuses a truncated file", () => {
        const k = key();
        const bundle = encryptJson(sampleBatch(), k);

        expect(() => decryptBundle(bundle.subarray(0, BUNDLE_MAGIC.length + 20), k)).toThrow();
        expect(() => decryptBundle(bundle.subarray(0, bundle.length - 1), k)).toThrow();
    });

    it("leaves no plaintext in the file", () => {
        const bundle = encryptJson(sampleBatch(), key());
        const asLatin1 = bundle.toString("latin1");
        const asUtf8 = bundle.toString("utf8");

        for (const marker of [...SECRET_MARKERS, "guests", "hero", "createdAt"]) {
            expect(asLatin1.includes(marker), marker).toBe(false);
            expect(asUtf8.includes(marker), marker).toBe(false);
            expect(asLatin1.includes(Buffer.from(marker).toString("base64")), `${marker} (base64)`).toBe(false);
        }
    });

    it("zeroes the plaintext buffer it encrypted", () => {
        const plaintext = Buffer.from(JSON.stringify(sampleBatch()), "utf8");
        encryptBundle(plaintext, key(), { wipe: true });

        expect(plaintext.every((byte) => byte === 0)).toBe(true);
    });
});

describe("migration key", () => {
    it("accepts exactly 32 bytes of base64", () => {
        const raw = randomBytes(32);
        expect(parseMigrationKey(raw.toString("base64")).equals(raw)).toBe(true);
    });

    it("refuses anything that is not a 32-byte base64 key", () => {
        expect(() => parseMigrationKey(undefined)).toThrow(/MIGRATION_ENCRYPTION_KEY/);
        expect(() => parseMigrationKey("")).toThrow();
        expect(() => parseMigrationKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
        expect(() => parseMigrationKey(randomBytes(48).toString("base64"))).toThrow(/32 bytes/);
        // A 64-char hex string is a passphrase, not a base64 key: it must not be
        // silently decoded into 48 random-looking bytes.
        expect(() => parseMigrationKey(randomBytes(32).toString("hex"))).toThrow();
        expect(() => parseMigrationKey("not base64 at all!!")).toThrow();
    });
});

describe("batch digest", () => {
    it("covers version, table, batchIndex, watermark and records", () => {
        const batch = sampleBatch();

        expect(batch.version).toBe(MIGRATION_BATCH_VERSION);
        expect(batch.sha256).toBe(migrationBatchDigest(batch));
        expect(migrationBatchDigest({ ...batch, batchIndex: 1 })).not.toBe(batch.sha256);
        expect(migrationBatchDigest({ ...batch, watermark: "x" })).not.toBe(batch.sha256);
        expect(migrationBatchDigest({ ...batch, table: "events" })).not.toBe(batch.sha256);
        expect(migrationBatchDigest({ ...batch, records: batch.records.slice(1) })).not.toBe(batch.sha256);
    });

    it("is insensitive to key order, like the Convex importer", () => {
        const batch = sampleBatch();
        const reordered = {
            ...batch,
            records: batch.records.map((record) =>
                Object.fromEntries(Object.entries(record).reverse()),
            ),
        };

        expect(migrationBatchDigest(reordered)).toBe(batch.sha256);
    });

    it("hashes file bytes as hex SHA-256", () => {
        expect(sha256Bytes(Buffer.from("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});
