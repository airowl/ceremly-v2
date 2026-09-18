import { createHmac } from "node:crypto";

/**
 * Independent RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s) used by gate G05.
 *
 * Deliberately *not* imported from Better Auth: the gate proves that a code
 * computed outside the auth implementation validates against the imported
 * secret, so a corrupted or re-encoded secret fails the check.
 *
 * Measured detail that decides the key material: the two-factor plugin stores
 * the **raw** secret and only base32-encodes it when it builds the `otpauth://`
 * URI for the authenticator app (`createOTP(...).url()` → `base32.encode()`).
 * Verification HMACs the stored string as-is (`@better-auth/utils` `createHMAC`
 * UTF-8 encodes string keys), so the key here must be the secret bytes, not a
 * base32 decoding of them.
 */
export function generateTotp(secret: string, atMs: number = Date.now()): string {
    const counter = Math.floor(atMs / 30_000);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));

    const digest = createHmac("sha1", Buffer.from(secret, "utf8")).update(buffer).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary =
        ((digest[offset]! & 0x7f) << 24) |
        ((digest[offset + 1]! & 0xff) << 16) |
        ((digest[offset + 2]! & 0xff) << 8) |
        (digest[offset + 3]! & 0xff);

    return String(binary % 1_000_000).padStart(6, "0");
}
