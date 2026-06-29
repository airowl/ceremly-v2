/**
 * useEventStats — typed $fetch wrapper for GET /api/events/:id/stats
 * (useProjects pattern; shape verified against event.service.ts → getEventStats).
 *
 * Includes usePolling: lightweight polling at a fixed interval (default 30s),
 * paused when the tab is hidden (document.hidden), automatically cleared
 * on scope dispose (component unmount).
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
 * Lightweight polling: invokes `callback` every `intervalMs` (default 30s).
 * - tick skipped if `document.hidden` (tab in background);
 * - automatic `stop()` on current scope dispose;
 * - idempotent `start()` (no duplicate timers), no-op on server.
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
            if (document.hidden) return; // paused: tab not visible
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
