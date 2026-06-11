/**
 * useButtonSuccess — stato bottone idle → loading → success → idle
 * (pattern A della guida UI). Dopo un'azione async riuscita il bottone
 * resta in stato "success" (check) per ~1.5s prima di tornare a riposo,
 * dando una conferma inline oltre al toast.
 *
 *   const save = useButtonSuccess()
 *   <button :class="{ success: save.isSuccess }" :disabled="save.busy"
 *           @click="save.run(() => doSave())">…</button>
 *
 * `run` rilancia l'errore (così il chiamante può comunque mostrare un toast):
 * in caso di errore NON entra in stato success.
 */
export function useButtonSuccess(successMs = 1500) {
    const isLoading = ref(false);
    const isSuccess = ref(false);
    // Disabilita il bottone sia durante l'azione sia durante la conferma.
    const busy = computed(() => isLoading.value || isSuccess.value);
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function run<T>(fn: () => Promise<T>): Promise<T> {
        if (busy.value) return undefined as T;
        if (timer) clearTimeout(timer);
        isLoading.value = true;
        try {
            const result = await fn();
            isSuccess.value = true;
            timer = setTimeout(() => { isSuccess.value = false; }, successMs);
            return result;
        } finally {
            isLoading.value = false;
        }
    }

    onScopeDispose(() => { if (timer) clearTimeout(timer); });

    // reactive(): nel template l'accesso `save.isSuccess` è già unwrappato.
    return reactive({ isLoading, isSuccess, busy, run });
}
