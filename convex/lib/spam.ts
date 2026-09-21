import { hmacSha256Hex } from "./bridgeHmac";

/**
 * Anti-spam dei form pubblici (plan Task 12, Step 5).
 *
 * Le primitive sono le stesse del legacy (`server/utils/spamProtection.ts`), con
 * la stessa lista di domini usa-e-getta e la stessa soglia di 3s: un port che
 * "migliora" una soglia cambia silenziosamente il comportamento in produzione.
 * Due cose invece cambiano di posto, ed è il motivo per cui questo file esiste:
 *
 * 1. **La decisione è server-side in Convex**, non nella route Nuxt. La route è
 *    solo trasporto: honeypot, timing, disposable e dedup non sono più
 *    aggirabili chiamando la route con un payload costruito a mano che salta le
 *    regole (le regole non sono mai state nel body, ma nel servizio: ora nel
 *    servizio Convex, dove sta anche la scrittura).
 * 2. **L'IP non entra mai in Convex in chiaro.** Il Worker calcola
 *    `hashClientIp(secret, ip)` e inoltra solo il digest: Convex non può
 *    risalire all'indirizzo, e il rate limit per-IP resta possibile. L'hash è
 *    HMAC e non SHA puro perché lo spazio degli IP è enumerabile in minuti:
 *    senza chiave, il digest sarebbe reversibile per forza bruta.
 */

/**
 * Domini usa-e-getta (copia esatta di `DISPOSABLE_DOMAINS` legacy).
 *
 * Copiata invece che importata perché il modulo legacy vive sotto `server/` e
 * importa `useRuntimeConfig`-dipendenti: un import da Convex porterebbe nel
 * bundle del runtime V8 moduli che lì non esistono. Il contratto è pinnato da un
 * test che confronta le due liste, così una divergenza è un test rosso.
 */
export const DISPOSABLE_DOMAINS: readonly string[] = [
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "tempmail.com",
    "throwaway.email",
    "temp-mail.org",
    "fakeinbox.com",
    "sharklasers.com",
    "guerrillamailblock.com",
    "grr.la",
    "dispostable.com",
    "yopmail.com",
    "yopmail.fr",
    "trashmail.com",
    "trashmail.me",
    "trashmail.net",
    "mailnesia.com",
    "maildrop.cc",
    "discard.email",
    "tempail.com",
    "mohmal.com",
    "getnada.com",
    "emailondeck.com",
    "10minutemail.com",
    "10minutemail.net",
    "minutemail.com",
    "tempinbox.com",
    "harakirimail.com",
    "mailcatch.com",
    "mytrashmail.com",
    "throwam.com",
    "mailexpire.com",
    "incognitomail.org",
    "mailnull.com",
    "spamgourmet.com",
    "jetable.org",
    "mailmoat.com",
    "trashymail.com",
    "mailzilla.com",
    "tempr.email",
    "burnermail.io",
    "guerrillamail.de",
    "tmail.ws",
];

/** True se il dominio dell'indirizzo è usa-e-getta. Come il legacy: `@` assente → false. */
export function isDisposableEmail(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    return DISPOSABLE_DOMAINS.includes(domain);
}

/** Soglia minima fra render del form e submit (ms). Identica al legacy. */
export const MIN_SUBMIT_TIME_MS = 3000;

/** True se il campo nascosto è stato compilato (bot). */
export function isHoneypotTriggered(value: unknown): boolean {
    return typeof value === "string" && value.length > 0;
}

/**
 * True se il form è stato inviato troppo in fretta (bot).
 *
 * Un `_t` assente o non numerico è "troppo in fretta": il legacy fa lo stesso, e
 * la direzione è quella giusta (un client che non sa dire quando ha caricato il
 * form non passa come umano).
 */
export function isSubmittedTooFast(loadedAt: unknown, now: number): boolean {
    if (typeof loadedAt !== "number" || !Number.isFinite(loadedAt) || loadedAt <= 0) return true;
    return now - loadedAt < MIN_SUBMIT_TIME_MS;
}

/**
 * Etichetta di dominio del digest dell'IP.
 *
 * Separare i domini impedisce che un digest calcolato per un altro scopo con la
 * stessa chiave possa essere presentato come "IP hash": la stringa fa parte del
 * messaggio firmato, quindi un digest di un'altra famiglia non è riutilizzabile.
 */
export const IP_HASH_LABEL = "ceremly:public-forms:ip:v1";

/** Algoritmo dichiarato nella matrice delle protezioni. */
export const IP_HASH_ALGORITHM = "hmac-sha256";

/**
 * Digest non reversibile dell'IP del client. Calcolato nel **Worker**, dove
 * l'indirizzo esiste davvero.
 *
 * Mirrors `hashClientIp` in `server/utils/publicFormsBridge.ts`; entrambi usano
 * `hmacSha256Hex` sui byte della stessa stringa, e un test di contratto alimenta
 * le due implementazioni con gli stessi vettori.
 */
export function hashClientIp(secret: string, ip: string): Promise<string> {
    return hmacSha256Hex(secret, `${IP_HASH_LABEL}\n${ip}`);
}

/** Un digest è 64 esadecimali: qualunque altra forma è un input non valido. */
export const isIpHashShaped = (value: unknown): value is string =>
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
