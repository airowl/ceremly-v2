/**
 * useButtonSuccess — button state idle → loading → success → idle
 * (UI guide pattern A). After a successful async action the button
 * stays in "success" state (checkmark) for ~1.5s before returning to idle,
 * providing inline confirmation beyond the toast.
 *
 *   const save = useButtonSuccess()
 *   <button :class="{ success: save.isSuccess }" :disabled="save.busy"
 *           @click="save.run(() => doSave())">…</button>
 *
 * `run` rethrows the error (so the caller can still show a toast):
 * on error it does NOT enter the success state.
 */
export function useButtonSuccess(successMs = 1500) {
    const isLoading = ref(false);
    const isSuccess = ref(false);
    // Disables the button both during the action and during the confirmation.
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

    // reactive(): in the template `save.isSuccess` is already unwrapped.
    return reactive({ isLoading, isSuccess, busy, run });
}
