/**
 * Generazione token ospite e slug evento (SPEC §0 + §2).
 *
 * - Token: 10 char base62, crypto-random con rejection sampling per
 *   distribuzione uniforme (256 % 62 !== 0 → i byte >= 248 vengono scartati).
 * - Slug: slugify(title) + '-' + 4 char random base36; NON è un segreto
 *   (il segreto è il token), serve solo per URL leggibili `/e/{slug}/{token}`.
 */
import { randomBytes } from "node:crypto";

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Estrae `length` caratteri dall'alfabeto dato usando crypto.randomBytes con
 * rejection sampling: accetta solo i byte < floor(256/N)*N così `byte % N`
 * resta uniforme sull'alfabeto.
 */
function randomFromAlphabet(alphabet: string, length: number): string {
    const n = alphabet.length;
    const max = Math.floor(256 / n) * n; // primo multiplo di n oltre il quale si scarta
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

/** Token ospite: 10 char base62, stabile per sempre (SPEC §2 `guests.token`). */
export function generateGuestToken(): string {
    return randomFromAlphabet(BASE62, 10);
}

/**
 * Slug evento: slugify del titolo (lowercase, accenti rimossi, non-alfanumerico
 * → '-', trim dei '-') + suffisso random di 4 char base36 per l'unicità.
 * Es. "Giulia & Tommaso" → "giulia-tommaso-x4k9".
 */
export function generateEventSlug(title: string): string {
    const base = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // rimuove i segni diacritici (accenti)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${base || "evento"}-${randomFromAlphabet(BASE36, 4)}`;
}
