// Import espliciti (non auto-import): questi moduli sono importati anche dal
// progetto TypeScript che controlla `test/**`, dove le global di Nuxt non
// esistono — e lì `computed` non risolverebbe.
import { computed, type ComputedRef, type Ref } from "vue";

/**
 * Messaggi d'errore Convex in forma leggibile (Task 14).
 *
 * Il backend lancia `ConvexError({ code, ...details })` (`convex/lib/identity.ts`)
 * e il client riceve un `Error` il cui `data` è quell'oggetto. Il `message` di un
 * `ConvexError` include il contesto della chiamata (modulo, request id), quindi
 * non è quello che si vuole in un toast: si preferisce `data.message`, poi il
 * `code`, e solo in mancanza del payload il `message` grezzo.
 *
 * `convexErrorMessage` è esportata perché serve anche nei `catch` delle pagine
 * (dove esiste un errore, non un ref) — è la sostituta di `extractErrorMessage`
 * di `useApi.ts`, che leggeva `data.statusMessage` di ofetch.
 */
/**
 * User-facing text for the codes every user can meet (final review M6).
 *
 * `SITE_READ_ONLY` is what every write returns during the cutover window
 * (`convex/lib/writeGuard.ts`); showing the raw code would be the only thing a
 * user sees for up to 30 minutes. A static map, not `useI18n()`: this module is
 * also imported outside a Nuxt context (tests, `catch` blocks after an
 * `await`), so the locale is read from `<html lang>`, which `app.vue` sets.
 */
export const KNOWN_ERROR_MESSAGES: Record<string, { it: string; en: string }> = {
    SITE_READ_ONLY: {
        it: "Il sito è temporaneamente in sola lettura per manutenzione: puoi consultare i tuoi dati, le modifiche saranno di nuovo possibili tra pochi minuti.",
        en: "The site is temporarily read-only for maintenance: you can view your data, and changes will be possible again in a few minutes.",
    },
};

function uiLocale(): "it" | "en" {
    const lang = (globalThis as { document?: { documentElement?: { lang?: string } } }).document?.documentElement
        ?.lang;
    return typeof lang === "string" && lang.toLowerCase().startsWith("en") ? "en" : "it";
}

export function convexErrorMessage(e: unknown, fallback = "Si è verificato un errore"): string {
    const err = e as {
        data?: { message?: unknown; code?: unknown };
        message?: unknown;
    } | null;

    const payload = err?.data;
    if (payload && typeof payload === "object") {
        const known = typeof payload.code === "string" ? KNOWN_ERROR_MESSAGES[payload.code] : undefined;
        if (known) return known[uiLocale()];
        if (typeof payload.message === "string" && payload.message.length > 0) {
            return payload.message;
        }
        if (typeof payload.code === "string" && payload.code.length > 0) {
            return payload.code;
        }
    }

    if (typeof err?.message === "string" && err.message.length > 0) {
        return err.message;
    }

    return fallback;
}

/**
 * Il `code` di un `ConvexError`, o `null`.
 *
 * Le pagine legacy decidevano sullo status HTTP (`402` → paywall); con Convex la
 * decisione è sul codice di dominio (`GUEST_LIMIT_REACHED`), che è più preciso di
 * uno status e non dipende da come il trasporto lo traduce.
 */
export function convexErrorCode(e: unknown): string | null {
    const code = (e as { data?: { code?: unknown } } | null)?.data?.code;
    return typeof code === "string" ? code : null;
}

/**
 * Versione reattiva: `null` finché non c'è errore, altrimenti il messaggio.
 *
 * Il tipo di ritorno è `string | null` (e non `Error`) perché i template
 * mostravano `{{ error.message }}` e una stringa è ciò che serve loro.
 */
export function useConvexError(error: Ref<Error | null>): ComputedRef<string | null> {
    return computed(() => (error.value ? convexErrorMessage(error.value) : null));
}
