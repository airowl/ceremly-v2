/**
 * useApi — wrapper unico per le chiamate $fetch lato client.
 *
 * Centralizza il pattern ripetuto in ogni composable (isLoading + error +
 * try/finally + estrazione messaggio) e aggiunge toast opzionali, così le
 * pagine non devono più scrivere a mano try/catch/toast per ogni azione.
 *
 *   const { isLoading, error, run } = useApi()
 *
 *   // load (solo stato + error, nessun toast)
 *   const items = await run(() => $fetch('/api/items'), { fallback: 'Errore' })
 *
 *   // mutation (toast automatici success/error)
 *   await run(() => $fetch('/api/items', { method: 'POST', body }), {
 *     fallback: t('items.createError'),
 *     successToast: t('items.createSuccess'),
 *   })
 */

/** Shape minima degli errori $fetch (ofetch FetchError). */
interface FetchErrorLike {
    statusCode?: number;
    data?: { statusMessage?: string; message?: string };
    message?: string;
}

/** Estrae il messaggio più specifico da un errore $fetch. */
export function extractErrorMessage(e: unknown, fallback: string): string {
    const err = (e ?? {}) as FetchErrorLike;
    return err.data?.statusMessage || err.data?.message || err.message || fallback;
}

export interface RunOptions {
    /** Messaggio usato se l'errore non ne espone uno. */
    fallback?: string;
    /** Se valorizzato, mostra un toast di successo con questo titolo. */
    successToast?: string;
    /** Mostra un toast di errore (default: true). Il titolo è il messaggio estratto. */
    errorToast?: boolean;
}

export function useApi() {
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const toast = useToast();

    async function run<T>(fn: () => Promise<T>, opts: RunOptions = {}): Promise<T> {
        const { fallback = "Si è verificato un errore", successToast, errorToast = true } = opts;
        isLoading.value = true;
        error.value = null;
        try {
            const result = await fn();
            if (successToast) toast.add({ title: successToast, color: "success" });
            return result;
        } catch (e) {
            const msg = extractErrorMessage(e, fallback);
            error.value = msg;
            if (errorToast) toast.add({ title: msg, color: "error" });
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, error, run };
}
