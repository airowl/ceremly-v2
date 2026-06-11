/**
 * useEventStats — wrapper $fetch tipizzato per GET /api/events/:id/stats
 * (pattern useProjects; shape verificata su event.service.ts → getEventStats).
 *
 * Include usePolling: polling leggero a intervallo fisso (default 30s),
 * in pausa quando il tab è nascosto (document.hidden), clear automatico
 * alla dispose dello scope (unmount del componente).
 */
import type { EventStats } from "~~/shared/types/ceremly";

export function useEventStats() {
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function getStats(eventId: string): Promise<EventStats> {
        isLoading.value = true;
        error.value = null;
        try {
            return await $fetch<EventStats>(`/api/events/${eventId}/stats`);
        } catch (e) {
            const err = e as { data?: { statusMessage?: string; message?: string }; message?: string };
            error.value
                = err.data?.statusMessage
                    || err.data?.message
                    || err.message
                    || "Errore nel caricamento delle statistiche";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, error, getStats };
}

/**
 * Polling leggero: invoca `callback` ogni `intervalMs` (default 30s).
 * - tick saltato se `document.hidden` (tab in background);
 * - `stop()` automatico alla dispose dello scope corrente;
 * - `start()` idempotente (no doppi timer), no-op su server.
 */
export function usePolling(
    callback: () => void | Promise<void>,
    intervalMs = 30_000,
) {
    let timer: ReturnType<typeof setInterval> | null = null;
    const isActive = ref(false);

    function start() {
        if (import.meta.server || timer) return;
        isActive.value = true;
        timer = setInterval(() => {
            if (document.hidden) return; // pausa: tab non visibile
            void callback();
        }, intervalMs);
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        isActive.value = false;
    }

    if (getCurrentScope()) {
        onScopeDispose(stop);
    }

    return { isActive, start, stop };
}
