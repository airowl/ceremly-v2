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
export function convexErrorMessage(e: unknown, fallback = "Si è verificato un errore"): string {
    const err = e as {
        data?: { message?: unknown; code?: unknown };
        message?: unknown;
    } | null;

    const payload = err?.data;
    if (payload && typeof payload === "object") {
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
 * Versione reattiva: `null` finché non c'è errore, altrimenti il messaggio.
 *
 * Il tipo di ritorno è `string | null` (e non `Error`) perché i template
 * mostravano `{{ error.message }}` e una stringa è ciò che serve loro.
 */
export function useConvexError(error: Ref<Error | null>): ComputedRef<string | null> {
    return computed(() => (error.value ? convexErrorMessage(error.value) : null));
}
