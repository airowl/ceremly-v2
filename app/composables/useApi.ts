/**
 * useApi — single wrapper for client-side $fetch calls.
 *
 * Centralises the repeated pattern across every composable (isLoading + error +
 * try/finally + message extraction) and adds optional toasts, so pages no
 * longer need to hand-write try/catch/toast for every action.
 *
 *   const { isLoading, error, run } = useApi()
 *
 *   // load (state + error only, no toast)
 *   const items = await run(() => $fetch('/api/items'), { fallback: 'Errore' })
 *
 *   // mutation (automatic success/error toasts)
 *   await run(() => $fetch('/api/items', { method: 'POST', body }), {
 *     fallback: t('items.createError'),
 *     successToast: t('items.createSuccess'),
 *   })
 */

/** Minimal shape of $fetch errors (ofetch FetchError). */
interface FetchErrorLike {
    statusCode?: number;
    data?: { statusMessage?: string; message?: string };
    message?: string;
}

/** Extracts the most specific message from a $fetch error. */
export function extractErrorMessage(e: unknown, fallback: string): string {
    const err = (e ?? {}) as FetchErrorLike;
    return err.data?.statusMessage || err.data?.message || err.message || fallback;
}

export interface RunOptions {
    /** Message used when the error doesn't expose one. */
    fallback?: string;
    /** If set, shows a success toast with this title. */
    successToast?: string;
    /** Shows an error toast (default: true). The title is the extracted message. */
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
