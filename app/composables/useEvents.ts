/**
 * useEvents — typed $fetch wrappers for the Ceremly event API (SPEC §6).
 * useProjects.ts pattern: shared isLoading/error + per-verb functions.
 *
 * Dates travel as ISO strings (payloads are JSON): the input types
 * are therefore defined here with date strings; on the server `z.coerce.date`
 * (createEventSchema/updateEventSchema) converts them.
 */
import type {
    CeremlyEvent,
    EventStatus,
    EventTypeKey,
    EventWithCounts,
    InviteBlock,
    RsvpQuestion,
    EventDistribution,
} from "~~/shared/types/ceremly";

/** Body for POST /api/events (createEventSchema, dates as strings). */
export interface CreateEventPayload {
    type: EventTypeKey;
    templateKey: string;
    title: string;
    eventDate?: string;
    eventTime?: string;
    locationName?: string;
    locationAddress?: string;
}

/** Body for PUT /api/events/:id (updateEventSchema, partial). */
export interface UpdateEventPayload {
    title?: string;
    eventDate?: string | null;
    eventTime?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    status?: EventStatus;
    blocks?: InviteBlock[];
    rsvpConfig?: RsvpQuestion[];
    rsvpDeadline?: string | null;
    rsvpClosedMessage?: string | null;
    distribution?: EventDistribution;
}

/** Human-readable message from a $fetch error (statusMessage h3 → message → fallback). */
function extractErrorMessage(e: unknown, fallback: string): string {
    const err = e as {
        data?: { statusMessage?: string, message?: string };
        message?: string;
    };
    return err?.data?.statusMessage || err?.data?.message || err?.message || fallback;
}

export function useEvents() {
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    /** GET /api/events — lists org events with aggregated counts. */
    async function listEvents(): Promise<EventWithCounts[]> {
        if (import.meta.server) return [];
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ events: EventWithCounts[] }>("/api/events");
            return res.events ?? [];
        } catch (e) {
            error.value = extractErrorMessage(e, "Errore nel caricamento degli eventi");
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /** GET /api/events/:id — full event. */
    async function getEvent(id: string): Promise<CeremlyEvent> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${id}`);
            return res.event;
        } catch (e) {
            error.value = extractErrorMessage(e, "Errore nel caricamento dell'evento");
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /** POST /api/events — creates from template (402 = Free plan limit). */
    async function createEvent(data: CreateEventPayload): Promise<CeremlyEvent> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ event: CeremlyEvent }>("/api/events", {
                method: "POST",
                body: data,
            });
            return res.event;
        } catch (e) {
            error.value = extractErrorMessage(e, "Errore nella creazione dell'evento");
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /** PUT /api/events/:id — partial update (422 = blocks/rsvpConfig invariants). */
    async function updateEvent(id: string, data: UpdateEventPayload): Promise<CeremlyEvent> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${id}`, {
                method: "PUT",
                body: data,
            });
            return res.event;
        } catch (e) {
            error.value = extractErrorMessage(e, "Errore nel salvataggio dell'evento");
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    /** DELETE /api/events/:id — hard delete with cascade. */
    async function deleteEvent(id: string): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await $fetch(`/api/events/${id}`, { method: "DELETE" });
        } catch (e) {
            error.value = extractErrorMessage(e, "Errore nell'eliminazione dell'evento");
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, error, listEvents, getEvent, createEvent, updateEvent, deleteEvent };
}
