import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { domainBatchCanonicalPayload } from "../../shared/migration/domainBatch";
import { MIGRATION_BATCH_VERSION, type MigrationBatch } from "./types";

/**
 * Encrypted migration bundles (plan Task 16, Step 1) — the only implementation.
 *
 * Every file the migration writes that holds rows is one of these. Credentials
 * (password hashes, 2FA secrets) and personal data never land on disk in clear
 * text: the plaintext lives in memory only, is encrypted as soon as a batch is
 * cut, and the plaintext buffer is zeroed right after.
 *
 * File format (binding, plan Step 1):
 *
 *   magic `CEREMLY-MIGRATION-V1` (20 bytes ASCII)
 *   IV                              (12 bytes, random per file)
 *   GCM auth tag                    (16 bytes)
 *   ciphertext                      (AES-256-GCM, same length as the plaintext)
 *
 * The magic is authenticated as additional data, so a file whose header was
 * edited fails exactly like a file whose ciphertext was edited.
 *
 * The key is `MIGRATION_ENCRYPTION_KEY`: 32 random bytes, base64. There is no
 * KDF on purpose — a passphrase would need a salt in the header and a cost
 * parameter to agree on, and the key is generated, not remembered.
 */

export const BUNDLE_MAGIC = Buffer.from("CEREMLY-MIGRATION-V1", "ascii");

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HEADER_LENGTH = BUNDLE_MAGIC.length + IV_LENGTH + TAG_LENGTH;

export { MIGRATION_BATCH_VERSION };

/**
 * Decodes `MIGRATION_ENCRYPTION_KEY`. Strict: only canonical base64 of exactly
 * 32 bytes. A hex string or a passphrase is refused rather than decoded into a
 * key nobody chose.
 */
export function parseMigrationKey(encoded: string | undefined): Buffer {
    const value = (encoded ?? "").trim();

    if (!value) {
        throw new Error(
            "Missing MIGRATION_ENCRYPTION_KEY: 32 random bytes, base64 " +
            "(e.g. `openssl rand -base64 32`). Migration bundles are never written in clear text.",
        );
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error("MIGRATION_ENCRYPTION_KEY is not base64");
    }

    const key = Buffer.from(value, "base64");
    if (key.length !== KEY_LENGTH || key.toString("base64") !== value) {
        throw new Error(`MIGRATION_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length})`);
    }

    return key;
}

/** Reads the key from the environment (`MIGRATION_ENCRYPTION_KEY`). */
export function migrationKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
    return parseMigrationKey(env.MIGRATION_ENCRYPTION_KEY);
}

const assertKey = (key: Buffer): void => {
    if (key.length !== KEY_LENGTH) {
        throw new Error(`Migration key must be ${KEY_LENGTH} bytes`);
    }
};

/**
 * Encrypts `plaintext` into a bundle. With `wipe: true` the plaintext buffer is
 * zeroed once the ciphertext exists (plan Step 3: `Buffer.fill(0)`).
 */
export function encryptBundle(plaintext: Buffer, key: Buffer, options: { wipe?: boolean } = {}): Buffer {
    assertKey(key);

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(BUNDLE_MAGIC);

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    if (options.wipe) plaintext.fill(0);

    return Buffer.concat([BUNDLE_MAGIC, iv, tag, ciphertext]);
}

/**
 * Decrypts a bundle, verifying the magic and the GCM tag. Throws on a wrong key,
 * any altered byte, or a truncated file — never returns unauthenticated bytes.
 */
export function decryptBundle(bundle: Buffer, key: Buffer): Buffer {
    assertKey(key);

    if (bundle.length < HEADER_LENGTH) {
        throw new Error("Not a migration bundle: file is shorter than its header");
    }
    if (!bundle.subarray(0, BUNDLE_MAGIC.length).equals(BUNDLE_MAGIC)) {
        throw new Error("Not a migration bundle: magic `CEREMLY-MIGRATION-V1` not found");
    }

    const iv = bundle.subarray(BUNDLE_MAGIC.length, BUNDLE_MAGIC.length + IV_LENGTH);
    const tag = bundle.subarray(BUNDLE_MAGIC.length + IV_LENGTH, HEADER_LENGTH);
    const ciphertext = bundle.subarray(HEADER_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(BUNDLE_MAGIC);
    decipher.setAuthTag(tag);

    try {
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
        // The OpenSSL message is not useful and must not suggest the file is
        // partially readable: authentication failed, nothing was decrypted.
        throw new Error("Migration bundle failed authentication (wrong key, or the file was altered)");
    }
}

/** Serializes, encrypts and wipes: the JSON plaintext exists only for the call. */
export function encryptJson(value: unknown, key: Buffer): Buffer {
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    return encryptBundle(plaintext, key, { wipe: true });
}

export function decryptJson<T = unknown>(bundle: Buffer, key: Buffer): T {
    const plaintext = decryptBundle(bundle, key);
    try {
        return JSON.parse(plaintext.toString("utf8")) as T;
    } finally {
        plaintext.fill(0);
    }
}

export function sha256Bytes(bytes: Buffer | string): string {
    return createHash("sha256").update(bytes).digest("hex");
}

/**
 * `MigrationBatch.sha256`: SHA-256 over the canonical bytes of
 * `{version, table, batchIndex, watermark, records}` — the exact form
 * `internal.migrations.domainImport.importBatch` recomputes on arrival
 * (`shared/migration/domainBatch.ts`), so one digest serves both the file check
 * and the importer's own check.
 */
export function migrationBatchDigest(batch: Omit<MigrationBatch<unknown>, "sha256"> | MigrationBatch<unknown>): string {
    return sha256Bytes(
        domainBatchCanonicalPayload({
            version: batch.version,
            table: batch.table,
            batchIndex: batch.batchIndex,
            watermark: batch.watermark,
            records: batch.records,
        }),
    );
}

/** Builds a `MigrationBatch` with its digest. */
export function sealBatch<T>(input: {
    table: string;
    watermark: string;
    batchIndex: number;
    records: T[];
}): MigrationBatch<T> {
    const unsealed = { version: MIGRATION_BATCH_VERSION, ...input };
    return { ...unsealed, sha256: migrationBatchDigest(unsealed) };
}

/** Throws when a decrypted batch does not match its own digest. */
export function assertBatchDigest(batch: MigrationBatch<unknown>): void {
    if (batch.version !== MIGRATION_BATCH_VERSION) {
        throw new Error(`Unsupported batch version ${String(batch.version)} (${batch.table}#${batch.batchIndex})`);
    }
    if (migrationBatchDigest(batch) !== batch.sha256) {
        throw new Error(`Batch digest mismatch for ${batch.table}#${batch.batchIndex}: the payload was altered`);
    }
}
