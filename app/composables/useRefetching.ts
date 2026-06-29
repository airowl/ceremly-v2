/**
 * useRefetching — contextual "updating" indicator (UI guide pattern E).
 * Silent refetches (data reloads without navigation, e.g.
 * stats polling or guest reload after an action) do not trigger the global
 * navigation bar: this shared counter shows a subtle badge
 * in the topbar while at least one refetch is in progress.
 *
 *   const { withRefetch } = useRefetching()
 *   await withRefetch(() => listGuests(eventId))
 *
 * Counter (not boolean) to handle concurrent refetches without turning off
 * the indicator too early.
 */
export function useRefetching() {
    const count = useState<number>("ceremly-refetching", () => 0);
    const isRefetching = computed(() => count.value > 0);

    async function withRefetch<T>(fn: () => Promise<T>): Promise<T> {
        count.value++;
        try {
            return await fn();
        } finally {
            count.value--;
        }
    }

    return { isRefetching, withRefetch };
}
