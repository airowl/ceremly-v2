/**
 * Token di anteprima firmato per il link dell'email di test.
 *
 * Il link pubblico `/e/{slug}/preview?sig=...` NON corrisponde a un ospite reale:
 * `sig` ha forma `{exp}.{hmac}` dove hmac = HMAC-SHA256(betterAuthSecret,
 * "preview:{slug}:{exp}") ed `exp` è l'epoch (secondi) di scadenza. Autorizza la
 * modalità anteprima (invito renderizzato con ospite-esempio, RSVP sola lettura).
 * Impossibile da indovinare → niente enumeration (SPEC §8.2), e funziona anche
 * dall'email non autenticata. Scadenza di 30 giorni firmata DENTRO l'HMAC (quindi
 * non manomettibile): un link inoltrato/leakato smette di funzionare e un test
 * scaduto si ri-invia.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Durata di validità del link di anteprima (30 giorni). */
const PREVIEW_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Epoch corrente in secondi. */
function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/** HMAC esadecimale di slug+scadenza con il segreto server (mai esposto al client). */
function computeSig(slug: string, exp: number): string {
    const secret = String(useRuntimeConfig().betterAuthSecret ?? "");
    return createHmac("sha256", secret).update(`preview:${slug}:${exp}`).digest("hex");
}

/** Token `{exp}.{hmac}` per il link di anteprima dello slug (valido 30 giorni). */
export function signPreviewToken(slug: string): string {
    const exp = nowSeconds() + PREVIEW_TTL_SECONDS;
    return `${exp}.${computeSig(slug, exp)}`;
}

/**
 * true se `sig` (forma `{exp}.{hmac}`) è la firma valida per lo slug e non è
 * scaduta (confronto timing-safe). `exp` è dentro l'HMAC → non manomettibile.
 */
export function verifyPreviewToken(slug: string, sig: string): boolean {
    if (!sig) return false;
    const dot = sig.indexOf(".");
    if (dot < 1) return false;
    const exp = Number(sig.slice(0, dot));
    if (!Number.isInteger(exp)) return false;
    if (nowSeconds() > exp) return false; // link scaduto
    const provided = sig.slice(dot + 1);
    const expected = computeSig(slug, exp);
    // Lunghezze diverse → timingSafeEqual lancerebbe: scarta prima del confronto.
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
        return false;
    }
}
