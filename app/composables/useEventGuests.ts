import { useConvexClient, useConvexMutation, useConvexQuery } from "convex-vue";
import type { FunctionReturnType } from "convex/server";
import {
    computed,
    onScopeDispose,
    ref,
    shallowRef,
    toValue,
    watch,
    type MaybeRefOrGetter,
} from "vue";
import { api } from "~~/convex/_generated/api";
import type { Doc } from "~~/convex/_generated/dataModel";
import { convexErrorMessage } from "~/composables/useConvexError";
import { isoOrNull } from "~/composables/useEvents";
import type {
    CeremlyGuest,
    GuestActivity,
    GuestActivityType,
    GuestWithStatus,
    RsvpAnswers,
    RsvpResponseData,
} from "~~/shared/types/ceremly";
import type {
    CreateGuestInput,
    SendInvitesInput,
    SendTestInput,
    UpdateGuestInput,
} from "~~/shared/schemas/ceremly";

/**
 * useEventGuests — Task 14, part a (ospiti, distribuzione).
 *
 * Tre composable invece di uno, perché leggono in tre modi diversi:
 *
 * - `useEventGuestList(eventId)` — la lista è una **query viva**
 *   (`api.guests.list`): un RSVP che arriva, un invio che marca "Inviato", un
 *   ospite aggiunto in un'altra scheda compaiono da soli. Le pagine non chiamano
 *   più `refreshGuests()` dopo una scrittura.
 * - `useGuestDetail(eventId, guestId)` — il dettaglio del drawer è vivo anch'esso,
 *   ma **opzionale**: con il drawer chiuso non c'è niente da sottoscrivere, e
 *   `convex-vue` non ha uno "skip". La sottoscrizione è quindi aperta e chiusa a
 *   mano (`client.onUpdate`) quando cambia l'ospite selezionato.
 * - `useEventGuests()` — le scritture: mutation per CRUD, import, invio e
 *   mark-sent; **action** per l'email di test, che va inviata adesso e il cui esito
 *   l'organizzatore aspetta (`convex-vue` non ha un composable per le action, da
 *   qui l'unico `client.action`).
 *
 * Il confine millisecondi ↔ ISO è qui (`toCeremlyGuest` & co.), per la stessa
 * ragione di `useEvents`: la UI è nata su stringhe ISO, Convex memorizza numeri.
 */

/** Summary di `api.guests.list` (solo ospiti attivi). */
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

/** Dettaglio di `api.guests.get`. */
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
    /**
     * Ospiti con email il cui accodamento è fallito. Con Convex è sempre 0 (i job
     * nascono nella stessa transazione, o tutti o nessuno): il campo resta per il
     * contratto della pagina.
     */
    failed: number;
}

// ---------------------------------------------------------------------------
// Adattatori Convex → UI
// ---------------------------------------------------------------------------

type ConvexGuestListRow = FunctionReturnType<typeof api.guests.list>["guests"][number];
type ConvexGuestDetail = FunctionReturnType<typeof api.guests.get>;

const requiredIso = (value: number): string => new Date(value).toISOString();

export function toCeremlyGuest(row: Doc<"guests">): CeremlyGuest {
    return {
        id: row._id,
        eventId: row.eventId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email ?? null,
        phone: row.phone ?? null,
        groupName: row.groupName ?? null,
        notes: row.notes ?? null,
        token: row.token,
        sentAt: isoOrNull(row.sentAt),
        sentChannel: row.sentChannel ?? null,
        emailOpenedAt: isoOrNull(row.emailOpenedAt),
        firstOpenedAt: isoOrNull(row.firstOpenedAt),
        openCount: row.openCount,
        remindersDisabled: row.remindersDisabled,
        removedAt: isoOrNull(row.removedAt),
        createdAt: requiredIso(row.createdAt),
        updatedAt: requiredIso(row.updatedAt),
    };
}

export function toGuestWithStatus(row: ConvexGuestListRow): GuestWithStatus {
    return {
        ...toCeremlyGuest(row),
        rsvpStatus: row.rsvpStatus,
        respondedAt: isoOrNull(row.respondedAt),
        totalPeople: row.totalPeople,
    };
}

export function toRsvpResponseData(row: Doc<"rsvpResponses">): RsvpResponseData {
    return {
        attending: row.attending,
        companionsCount: row.companionsCount,
        answers: row.answers as RsvpAnswers,
        declineMessage: row.declineMessage ?? null,
        submittedAt: requiredIso(row.submittedAt),
        updatedAt: isoOrNull(row.updatedAt),
    };
}

export function toGuestActivity(row: Doc<"guestActivities">): GuestActivity {
    return {
        id: row._id,
        guestId: row.guestId,
        type: row.type as GuestActivityType,
        meta: (row.meta ?? {}) as Record<string, unknown>,
        createdAt: requiredIso(row.createdAt),
    };
}

export function toGuestDetail(result: ConvexGuestDetail): GuestDetailResult {
    return {
        guest: toCeremlyGuest(result.guest),
        response: result.response ? toRsvpResponseData(result.response) : null,
        activities: result.activities.map(toGuestActivity),
    };
}

/**
 * Body del form → argomenti della mutation.
 *
 * Le chiavi `undefined` si tolgono: gli argomenti Convex sono validati
 * strettamente, e "campo assente" e "campo presente ma vuoto" sono istruzioni
 * diverse per `guests.update` (la stringa vuota azzera, l'assenza non tocca).
 */
function definedOnly<T extends Record<string, unknown>>(input: T): T {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
    ) as T;
}

// ---------------------------------------------------------------------------
// Letture vive
// ---------------------------------------------------------------------------

/** Lista ospiti dell'evento (inclusi i rimossi, con `removedAt`) + summary, viva. */
export function useEventGuestList(eventId: MaybeRefOrGetter<string>) {
    /** Ri-sottoscrizione su richiesta (il "riprova"): vedi `useEventStats`. */
    const retryNonce = ref(0);

    const { data, error, isPending } = useConvexQuery(
        api.guests.list,
        () => {
            void retryNonce.value;
            return { eventId: toValue(eventId) as never };
        },
        { server: false },
    );

    return {
        guests: computed<GuestWithStatus[]>(() => (data.value?.guests ?? []).map(toGuestWithStatus)),
        summary: computed<GuestListSummary | null>(() => data.value?.summary ?? null),
        isLoading: isPending,
        error: computed<string | null>(() => (error.value ? convexErrorMessage(error.value) : null)),
        retry: () => {
            retryNonce.value += 1;
        },
    };
}

/**
 * Dettaglio ospite, vivo, sottoscritto solo mentre `guestId` non è `null`.
 *
 * `useConvexQuery` sottoscrive sempre, quindi il "salta quando chiuso" è scritto
 * qui: un cambio di ospite chiude la sottoscrizione precedente prima di aprire la
 * nuova, e lo scope del componente chiude l'ultima.
 */
export function useGuestDetail(
    eventId: MaybeRefOrGetter<string>,
    guestId: MaybeRefOrGetter<string | null>,
) {
    const client = useConvexClient();
    const detail = shallowRef<GuestDetailResult | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    /** Il "riprova" dopo un errore: riapre la sottoscrizione sullo stesso ospite. */
    const retryNonce = ref(0);
    let unsubscribe: (() => void) | undefined;

    watch(
        () => [toValue(eventId), toValue(guestId), retryNonce.value] as const,
        ([currentEventId, currentGuestId]) => {
            unsubscribe?.();
            unsubscribe = undefined;
            detail.value = null;
            error.value = null;

            if (!currentGuestId) {
                isLoading.value = false;
                return;
            }

            isLoading.value = true;
            unsubscribe = client.onUpdate(
                api.guests.get,
                { eventId: currentEventId as never, guestId: currentGuestId as never },
                (result) => {
                    detail.value = toGuestDetail(result);
                    isLoading.value = false;
                },
                (err) => {
                    error.value = convexErrorMessage(err);
                    isLoading.value = false;
                },
            );
        },
        { immediate: true },
    );

    onScopeDispose(() => unsubscribe?.());

    return {
        detail,
        isLoading,
        error,
        retry: () => {
            retryNonce.value += 1;
        },
    };
}

// ---------------------------------------------------------------------------
// Scritture
// ---------------------------------------------------------------------------

/**
 * Le scritture sugli ospiti. Gli errori arrivano come `ConvexError` (il `code`
 * con `convexErrorCode`, il testo con `convexErrorMessage`): le pagine gestiscono
 * i propri toast, come facevano con il composable legacy.
 */
export function useEventGuests() {
    const client = useConvexClient();
    const createMutation = useConvexMutation(api.guests.create);
    const updateMutation = useConvexMutation(api.guests.update);
    const removeMutation = useConvexMutation(api.guests.softDelete);
    const importMutation = useConvexMutation(api.guests.importRows);
    const sendMutation = useConvexMutation(api.guests.sendInvites);
    const markSentMutation = useConvexMutation(api.guests.markSent);

    const testPending = ref(false);

    const isLoading = computed(() =>
        createMutation.isPending.value
        || updateMutation.isPending.value
        || removeMutation.isPending.value
        || importMutation.isPending.value
        || sendMutation.isPending.value
        || markSentMutation.isPending.value
        || testPending.value);

    async function createGuest(eventId: string, data: CreateGuestInput): Promise<CeremlyGuest> {
        const row = await createMutation.mutate({
            eventId: eventId as never,
            input: definedOnly(data),
        });
        return toCeremlyGuest(row!);
    }

    async function updateGuest(
        eventId: string,
        guestId: string,
        data: UpdateGuestInput,
    ): Promise<CeremlyGuest> {
        const row = await updateMutation.mutate({
            eventId: eventId as never,
            guestId: guestId as never,
            input: definedOnly(data),
        });
        return toCeremlyGuest(row!);
    }

    async function deleteGuest(eventId: string, guestId: string): Promise<void> {
        await removeMutation.mutate({ eventId: eventId as never, guestId: guestId as never });
    }

    async function importGuests(
        eventId: string,
        rows: CreateGuestInput[],
    ): Promise<GuestImportResult> {
        return await importMutation.mutate({
            eventId: eventId as never,
            rows: rows.map((row) => definedOnly(row)),
        });
    }

    async function sendInvites(eventId: string, data: SendInvitesInput): Promise<SendInvitesResult> {
        return await sendMutation.mutate({
            eventId: eventId as never,
            guestIds: data.guestIds as never,
            subject: data.subject,
            body: data.body,
        });
    }

    async function sendTest(eventId: string, override?: SendTestInput): Promise<{ success: boolean }> {
        testPending.value = true;
        try {
            return await client.action(api.guests.sendTest, {
                eventId: eventId as never,
                ...definedOnly({ subject: override?.subject, body: override?.body }),
            });
        } finally {
            testPending.value = false;
        }
    }

    async function markWhatsappSent(eventId: string, guestIds: string[]): Promise<{ marked: number }> {
        return await markSentMutation.mutate({
            eventId: eventId as never,
            guestIds: guestIds as never,
        });
    }

    return {
        isLoading,
        createGuest,
        updateGuest,
        deleteGuest,
        importGuests,
        sendInvites,
        sendTest,
        markWhatsappSent,
    };
}
