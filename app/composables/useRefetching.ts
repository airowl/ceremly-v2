/**
 * useRefetching — indicatore "aggiornamento" contestuale (pattern E della
 * guida UI). I refetch silenziosi (ricariche dati senza navigazione, es.
 * polling stats o reload ospiti dopo un'azione) non attivano la barra di
 * navigazione globale: questo counter condiviso fa apparire un badge
 * discreto nella topbar mentre almeno un refetch è in corso.
 *
 *   const { withRefetch } = useRefetching()
 *   await withRefetch(() => listGuests(eventId))
 *
 * Counter (non boolean) per gestire refetch concorrenti senza spegnere
 * l'indicatore troppo presto.
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
