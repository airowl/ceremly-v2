/**
 * useEvents — wrapper $fetch tipizzati per le API eventi Ceremly (SPEC §6).
 * Pattern di useProjects.ts: isLoading/error condivisi + funzioni per verbo.
 *
 * Le date viaggiano come stringhe ISO (i payload sono JSON): i tipi di input
 * sono quindi definiti qui con date string, lato server `z.coerce.date`
 * (createEventSchema/updateEventSchema) le converte.
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

/** Body di POST /api/events (createEventSchema, date come stringhe). */
export interface CreateEventPayload {
    type: EventTypeKey;
    templateKey: string;
    title: string;
    eventDate?: string;
    eventTime?: string;
    locationName?: string;
    locationAddress?: string;
}

/** Body di PUT /api/events/:id (updateEventSchema, parziale). */
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

/** Messaggio leggibile da un errore $fetch (statusMessage h3 → message → fallback). */
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

    /** GET /api/events — lista eventi org con counts aggregati. */
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

    /** GET /api/events/:id — evento completo. */
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

    /** POST /api/events — crea da template (402 = limite piano Free). */
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

    /** PUT /api/events/:id — update parziale (422 = invarianti blocks/rsvpConfig). */
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

    /** DELETE /api/events/:id — hard delete con cascade. */
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
