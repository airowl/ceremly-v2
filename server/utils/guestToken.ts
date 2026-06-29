/**
 * Guest token and event slug generation (SPEC §0 + §2).
 *
 * - Token: 10 char base62, crypto-random with rejection sampling for
 *   uniform distribution (256 % 62 !== 0 → bytes >= 248 are discarded).
 * - Slug: slugify(title) + '-' + 4 random base36 chars; NOT a secret
 *   (the secret is the token), used only for readable URLs `/e/{slug}/{token}`.
 */
import { randomBytes } from "node:crypto";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Extracts `length` characters from the given alphabet using crypto.randomBytes
 * with rejection sampling: accepts only bytes < floor(256/N)*N so that `byte % N`
 * remains uniform over the alphabet.
 */
function randomFromAlphabet(alphabet: string, length: number): string {
    const n = alphabet.length;
    const max = Math.floor(256 / n) * n; // first multiple of n beyond which bytes are discarded
    let out = "";
    while (out.length < length) {
        const bytes = randomBytes(length * 2);
        for (let i = 0; i < bytes.length && out.length < length; i++) {
            const byte = bytes[i]!;
            if (byte < max) {
                out += alphabet[byte % n];
            }
        }
    }
    return out;
}

/** Guest token: 10 char base62, stable forever (SPEC §2 `guests.token`). */
export function generateGuestToken(): string {
    return randomFromAlphabet(BASE62, 10);
}

/**
 * Event slug: slugify of the title (lowercase, accents removed, non-alphanumeric
 * → '-', '-' trimmed) + 4 random base36 char suffix for uniqueness.
 * E.g. "Giulia & Tommaso" → "giulia-tommaso-x4k9".
 */
export function generateEventSlug(title: string): string {
    const base = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // removes diacritic marks (accents)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${base || "evento"}-${randomFromAlphabet(BASE36, 4)}`;
}
