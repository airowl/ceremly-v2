/**
 * Token di anteprima firmato per il link dell'email di test.
 *
 * Il link pubblico `/e/{slug}/preview?sig=...` NON corrisponde a un ospite reale:
 * `sig` è un HMAC-SHA256(betterAuthSecret, "preview:{slug}") che autorizza la
 * modalità anteprima (invito renderizzato con ospite-esempio, RSVP sola lettura).
 * Impossibile da indovinare → niente enumeration (SPEC §8.2), e funziona anche
 * dall'email non autenticata. Nessuna scadenza: l'anteprima non espone dati ospite.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC esadecimale dello slug con il segreto server (mai esposto al client). */
function computeSig(slug: string): string {
    const secret = String(useRuntimeConfig().betterAuthSecret ?? "");
    return createHmac("sha256", secret).update(`preview:${slug}`).digest("hex");
}

/** Firma per il link di anteprima dello slug indicato. */
export function signPreviewToken(slug: string): string {
    return computeSig(slug);
}

/** true se `sig` è la firma valida per lo slug (confronto timing-safe). */
export function verifyPreviewToken(slug: string, sig: string): boolean {
    if (!sig) return false;
    const expected = computeSig(slug);
    // Lunghezze diverse → timingSafeEqual lancerebbe: scarta prima del confronto.
    if (sig.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}
