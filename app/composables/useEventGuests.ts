/**
 * useEventGuests — wrapper $fetch tipizzati per ospiti + distribuzione
 * (pattern useProjects). Shape verificate su guest.service.ts e
 * distribution.service.ts (fonte di verità: il codice server).
 */
import type {
    CeremlyGuest,
    GuestActivity,
    GuestWithStatus,
    RsvpResponseData,
} from "~~/shared/types/ceremly";
import type {
    CreateGuestInput,
    SendInvitesInput,
    SendTestInput,
    UpdateGuestInput,
} from "~~/shared/schemas/ceremly";

/** Summary di GET /api/events/:id/guests (solo ospiti attivi). */
export interface GuestListSummary {
    total: number;
    confirmed: number;
    declined: number;
    maybe: number;
    /** opened + not_opened (i 'maybe' hanno risposto: non sono pending). */
    pending: number;
    opened: number;
    removed: number;
}

export interface GuestListResult {
    guests: GuestWithStatus[];
    summary: GuestListSummary;
}

/** Dettaglio di GET /api/events/:id/guests/:guestId. */
export interface GuestDetailResult {
    guest: CeremlyGuest;
    response: RsvpResponseData | null;
    activities: GuestActivity[];
}

/** Riga problematica dell'import (indice 1-based su `rows`). */
export interface GuestImportIssue {
    row: number;
    reason: string;
}

export interface GuestImportResult {
    imported: number;
    skipped: GuestImportIssue[];
    warnings: GuestImportIssue[];
}

export interface SendInvitesResult {
    queued: number;
    skippedNoEmail: number;
}

/** Shape minima degli errori $fetch (ofetch FetchError). */
interface FetchErrorLike {
    statusCode?: number;
    data?: { statusMessage?: string; message?: string };
    message?: string;
}

export function useEventGuests() {
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
        isLoading.value = true;
        error.value = null;
        try {
            return await fn();
        } catch (e) {
            const err = (e ?? {}) as FetchErrorLike;
            error.value = err.data?.statusMessage || err.data?.message || err.message || fallback;
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function listGuests(eventId: string): Promise<GuestListResult> {
        return run(
            () => $fetch<GuestListResult>(`/api/events/${eventId}/guests`),
            "Errore nel caricamento degli ospiti",
        );
    }

    async function getGuest(eventId: string, guestId: string): Promise<GuestDetailResult> {
        return run(
            () => $fetch<GuestDetailResult>(`/api/events/${eventId}/guests/${guestId}`),
            "Errore nel caricamento dell'ospite",
        );
    }

    async function createGuest(eventId: string, data: CreateGuestInput): Promise<CeremlyGuest> {
        return run(
            async () => {
                const res = await $fetch<{ guest: CeremlyGuest }>(`/api/events/${eventId}/guests`, {
                    method: "POST",
                    body: data,
                });
                return res.guest;
            },
            "Errore nella creazione dell'ospite",
        );
    }

    async function updateGuest(
        eventId: string,
        guestId: string,
        data: UpdateGuestInput,
    ): Promise<CeremlyGuest> {
        return run(
            async () => {
                const res = await $fetch<{ guest: CeremlyGuest }>(
                    `/api/events/${eventId}/guests/${guestId}`,
                    { method: "PUT", body: data },
                );
                return res.guest;
            },
            "Errore nell'aggiornamento dell'ospite",
        );
    }

    async function deleteGuest(eventId: string, guestId: string): Promise<void> {
        await run(
            () => $fetch(`/api/events/${eventId}/guests/${guestId}`, { method: "DELETE" }),
            "Errore nell'eliminazione dell'ospite",
        );
    }

    async function importGuests(
        eventId: string,
        rows: CreateGuestInput[],
    ): Promise<GuestImportResult> {
        return run(
            () => $fetch<GuestImportResult>(`/api/events/${eventId}/guests/import`, {
                method: "POST",
                body: { rows },
            }),
            "Errore nell'import degli ospiti",
        );
    }

    async function sendInvites(
        eventId: string,
        data: SendInvitesInput,
    ): Promise<SendInvitesResult> {
        return run(
            () => $fetch<SendInvitesResult>(`/api/events/${eventId}/send`, {
                method: "POST",
                body: data,
            }),
            "Errore nell'invio degli inviti",
        );
    }

    async function sendTest(
        eventId: string,
        override?: SendTestInput,
    ): Promise<{ success: boolean }> {
        return run(
            () => $fetch<{ success: boolean }>(`/api/events/${eventId}/send-test`, {
                method: "POST",
                body: override ?? {},
            }),
            "Errore nell'invio dell'email di test",
        );
    }

    async function markWhatsappSent(
        eventId: string,
        guestIds: string[],
    ): Promise<{ marked: number }> {
        return run(
            () => $fetch<{ marked: number }>(`/api/events/${eventId}/mark-sent`, {
                method: "POST",
                body: { guestIds },
            }),
            "Errore nell'aggiornamento dello stato di invio",
        );
    }

    return {
        isLoading,
        error,
        listGuests,
        getGuest,
        createGuest,
        updateGuest,
        deleteGuest,
        importGuests,
        sendInvites,
        sendTest,
        markWhatsappSent,
    };
}
