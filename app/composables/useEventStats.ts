import { useConvexQuery } from "convex-vue";
import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { api } from "~~/convex/_generated/api";
import { convexErrorMessage } from "~/composables/useConvexError";
import type { EventStats } from "~~/shared/types/ceremly";

/**
 * useEventStats — Task 14, parte finale dello Step 3.
 *
 * Prima: `GET /api/events/:id/stats` con polling a 30s, in pausa quando il tab
 * era nascosto. Ora: `api.events.stats` è una query viva, quindi **il polling
 * non esiste più** — e con esso il timer, la pausa su `document.hidden` e la
 * finestra di 30 secondi in cui un RSVP appena arrivato non si vedeva. Era il
 * compromesso dichiarato del polling; non serve più dichiararlo.
 *
 * Non c'è `getStats()` imperativa: la pagina legge `stats`. Una lettura
 * una-tantum qui non serve a nessuno — l'unico consumatore è la pagina di
 * dettaglio, che vuole il dato vivo — e un helper senza chiamanti è una seconda
 * strada aperta per il prossimo che passa (il gate in
 * `test/migration/frontend-data-layer.test.ts` lo rifiuterebbe).
 */
export function useEventStats(eventId: MaybeRefOrGetter<string>) {
    /**
     * Ri-sottoscrizione su richiesta (il pulsante "riprova" della pagina).
     *
     * Una query viva non ha `refresh()`, ma **cambia identità degli argomenti**
     * quando cambia questo contatore: il getter restituisce un oggetto nuovo,
     * l'argomento per Convex resta lo stesso evento, e la sottoscrizione riparte.
     */
    const retryNonce = ref(0);

    const { data, error, isPending } = useConvexQuery(
        api.events.stats,
        () => {
            void retryNonce.value;
            return { eventId: toValue(eventId) as never };
        },
        { server: false },
    );

    return {
        stats: computed<EventStats | null>(() => (data.value as EventStats | undefined) ?? null),
        isLoading: isPending,
        error: computed<string | null>(() =>
            error.value ? convexErrorMessage(error.value) : null),
        retry: () => {
            retryNonce.value += 1;
        },
    };
}
