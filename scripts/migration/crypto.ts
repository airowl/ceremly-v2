import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Envelope for migration payloads.
 *
 * Credential batches carry password hashes and 2FA secrets, so they never land
 * on disk in clear text: AES-256-GCM with a scrypt-derived key, authenticated so
 * a tampered batch fails to decrypt instead of importing garbage. Task 16 reuses
 * the same envelope for the full data export.
 */
export const MIGRATION_BATCH_VERSION = "2026-09-15";

export interface EncryptedEnvelope {
    version: string;
    algorithm: "aes-256-gcm";
    kdf: "scrypt";
    salt: string;
    iv: string;
    tag: string;
    ciphertext: string;
}

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

const deriveKey = (passphrase: string, salt: Buffer): Buffer =>
    scryptSync(passphrase, salt, KEY_LENGTH);

export function encryptJson(value: unknown, passphrase: string): EncryptedEnvelope {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);

    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
    ]);

    return {
        version: MIGRATION_BATCH_VERSION,
        algorithm: "aes-256-gcm",
        kdf: "scrypt",
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
}

export function decryptJson<T = unknown>(envelope: EncryptedEnvelope, passphrase: string): T {
    const decipher = createDecipheriv(
        "aes-256-gcm",
        deriveKey(passphrase, Buffer.from(envelope.salt, "base64")),
        Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
    ]);

    return JSON.parse(plaintext.toString("utf8")) as T;
}

export function parseEncryptedEnvelope(raw: string): EncryptedEnvelope {
    const parsed = JSON.parse(raw) as EncryptedEnvelope;

    if (parsed.algorithm !== "aes-256-gcm" || !parsed.ciphertext || !parsed.iv) {
        throw new Error("Not a migration envelope: refusing to treat the file as a batch");
    }

    return parsed;
}

export function sha256Hex(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
