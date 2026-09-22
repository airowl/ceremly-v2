import { useConvexClient, useConvexMutation, useConvexQuery } from "convex-vue";
import { toValue, type MaybeRefOrGetter } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Doc } from "~~/convex/_generated/dataModel";
import { convexErrorMessage, useConvexError } from "~/composables/useConvexError";
import type {
    CeremlyEvent,
    EventStatus,
    EventTypeKey,
    EventWithCounts,
    InviteBlock,
    RsvpQuestion,
    EventDistribution,
    EventCounts,
} from "~~/shared/types/ceremly";

/**
 * useEvents — Task 14, secondo vertical slice.
 *
 * ## Perché esistono degli adattatori
 *
 * Il legacy serviva JSON da Postgres: le colonne `timestamp` di Drizzle
 * diventavano stringhe ISO e la UI si è costruita su quello (`new Date(e.eventDate)`,
 * `date-fns`, e in un punto un `localeCompare` fra date). Convex memorizza
 * **millisecondi** (`v.number()`), quindi il confine di conversione sta qui e non
 * nel template: entrata ISO → numero per le mutation, uscita numero → ISO per le
 * query. Sono due funzioni pure esportate, così il contratto è verificabile senza
 * un client Convex.
 *
 * ## Cosa non c'è più
 *
 * `listEvents()` / `getEvent()` erano Promise. Restituirle avrebbe voluto dire
 * `useConvexClient().query(...)`, cioè rinunciare alla query viva — l'unica cosa
 * che il port aggiunge. Chi legge usa `events` / `event`, chi scrive usa le
 * mutation.
 */

/** Body di create (date come stringhe ISO, come le mandava il form legacy). */
export interface CreateEventPayload {
    type: EventTypeKey;
    templateKey: string;
    title: string;
    eventDate?: string;
    eventTime?: string;
    locationName?: string;
    locationAddress?: string;
}

/** Body di update (parziale; `null` azzera il campo, come nel legacy). */
export interface UpdateEventPayload {
    title?: string;
    eventDate?: string | null;
    eventTime?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    status?: EventStatus;
    theme?: CeremlyEvent["theme"];
    inviteFont?: string | null;
    blocks?: InviteBlock[];
    rsvpConfig?: RsvpQuestion[];
    rsvpDeadline?: string | null;
    rsvpClosedMessage?: string | null;
    distribution?: EventDistribution;
}

/** Una data numerica Convex nella forma ISO che la UI legge. */
export function isoOrNull(value: number | null | undefined): string | null {
    return value === null || value === undefined ? null : new Date(value).toISOString();
}

/** L'inverso: una data ISO del form nel numero che Convex memorizza. */
export function timestampOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Date.parse(value);
    // Una data non valida è un bug del chiamante, non un valore da salvare a metà:
    // `NaN` finirebbe nello schema come numero e nessuna query lo troverebbe.
    if (Number.isNaN(parsed)) throw new Error(`Data non valida: ${value}`);
    return parsed;
}

/**
 * La riga è quella **generata** (`Doc<"events">`), non una copia scritta a mano:
 * una seconda descrizione della stessa tabella è una descrizione che invecchia
 * alla prima colonna aggiunta.
 */
type ConvexEventRow = Doc<"events">;

/** `status` è `v.string()` nello schema: la union la restringe la lettura. */
export function toEventStatus(status: string): EventStatus {
    return status === "draft" || status === "closed" ? status : "active";
}

/**
 * `distribution` nello schema Convex ha i quattro campi **opzionali** (scelta
 * dell'import: righe parziali esistono eccome, e un validator stretto le
 * rifiuterebbe in blocco), mentre la UI li legge come stringhe. Il create di
 * Convex li riempie sempre tutti (`getDefaultDistribution`), quindi il fallback
 * copre solo righe parziali — e in quel caso "campo vuoto" è la verità, non un
 * default inventato dal client che divergerebbe da quello del server.
 */
export function toEventDistribution(
    row: Partial<EventDistribution> | undefined,
): EventDistribution {
    return {
        emailSubject: row?.emailSubject ?? "",
        emailBody: row?.emailBody ?? "",
        whatsappTemplate: row?.whatsappTemplate ?? "",
        senderName: row?.senderName ?? "",
    };
}

export function toCeremlyEvent(row: ConvexEventRow): CeremlyEvent {
    return {
        id: row._id,
        organizationId: row.organizationId,
        type: row.type,
        templateKey: row.templateKey,
        theme: row.theme ?? null,
        inviteFont: row.inviteFont ?? null,
        title: row.title,
        slug: row.slug,
        eventDate: isoOrNull(row.eventDate),
        eventTime: row.eventTime ?? null,
        locationName: row.locationName ?? null,
        locationAddress: row.locationAddress ?? null,
        status: toEventStatus(row.status),
        tier: row.tier,
        unlockedAt: isoOrNull(row.unlockedAt),
        blocks: row.blocks,
        rsvpConfig: row.rsvpConfig,
        rsvpDeadline: isoOrNull(row.rsvpDeadline),
        rsvpClosedMessage: row.rsvpClosedMessage ?? null,
        distribution: toEventDistribution(row.distribution),
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
    };
}

function toEventWithCounts(row: ConvexEventRow & { counts: EventCounts }): EventWithCounts {
    return { ...toCeremlyEvent(row), counts: row.counts };
}

/**
 * Le chiavi di `UpdateEventPayload` che viaggiano come date e vanno convertite.
 * Dichiarate una volta sola perché `Object.keys` non conserva il tipo, e una
 * conversione "a occhio" su un campo nuovo sarebbe la prima cosa che si dimentica.
 */
const TIMESTAMP_FIELDS = ["eventDate", "rsvpDeadline"] as const;

/** Payload UI → argomenti della mutation Convex. */
export function toUpdateArgs(input: UpdateEventPayload): Record<string, unknown> {
    const args: Record<string, unknown> = { ...input };

    for (const field of TIMESTAMP_FIELDS) {
        if (input[field] !== undefined) {
            args[field] = timestampOrNull(input[field]);
        }
    }

    return args;
}

export function useEvents() {
    /**
     * Il contatore che rende possibile `retry()`.
     *
     * La home ha un pulsante "riprova" e una query viva non ha un `refresh()`:
     * si ri-sottoscrive quando gli **argomenti cambiano identità** (`convex-vue`
     * osserva l'oggetto args, non lo confronta in profondità). Il getter restituisce
     * quindi un oggetto nuovo a ogni cambio del contatore — che per Convex resta
     * `{}`, quindi la query rieseguita è esattamente la stessa.
     */
    const retryNonce = ref(0);

    const {
        data,
        error: queryError,
        isPending,
    } = useConvexQuery(
        api.events.listAll,
        () => {
            void retryNonce.value;
            return {};
        },
        { server: false },
    );

    const createMutation = useConvexMutation(api.events.create);

    const events = computed<EventWithCounts[]>(
        () => (data.value?.events ?? []).map(toEventWithCounts),
    );
    const truncated = computed(() => data.value?.truncated ?? false);
    const isLoading = computed(() => isPending.value || createMutation.isPending.value);
    const error = useConvexError(queryError);

    /** Crea da template. Il tetto di piano arriva come `ACTIVE_EVENT_LIMIT_REACHED`. */
    async function createEvent(input: CreateEventPayload): Promise<CeremlyEvent> {
        const { eventDate, ...rest } = input;
        const created = await createMutation.mutate({
            input: {
                ...rest,
                ...(eventDate ? { eventDate: timestampOrNull(eventDate)! } : {}),
            },
        });
        return toCeremlyEvent(created);
    }

    /** Ri-sottoscrive la lista (il "riprova" della home). */
    function retry(): void {
        retryNonce.value += 1;
    }

    return { events, truncated, isLoading, error, retry, createEvent };
}

/**
 * Operazioni sul singolo evento, **senza** sottoscrivere la lista.
 *
 * Editor, configurazione RSVP e distribuzione partono da una copia editabile
 * dell'evento: lì una query viva sarebbe un difetto, non una funzione —
 * riscriverebbe il form sotto le dita dell'utente a ogni scrittura (anche di
 * un'altra scheda). Servono un lettura una-tantum e delle mutation, e la lettura
 * una-tantum è `client.query(...)` (imperativa) e non `useConvexQuery`.
 *
 * Il client si prende **qui**, in setup: `useConvexClient()` usa `inject`, che
 * fuori dal contesto di setup non risolve.
 */
export function useEventActions() {
    const client = useConvexClient();
    const updateMutation = useConvexMutation(api.events.update);
    const removeMutation = useConvexMutation(api.events.remove);

    async function getEventOnce(id: string): Promise<CeremlyEvent> {
        const row = await client.query(api.events.get, { eventId: id as never });
        return toCeremlyEvent(row);
    }

    async function updateEvent(id: string, input: UpdateEventPayload): Promise<CeremlyEvent> {
        const updated = await updateMutation.mutate({
            eventId: id as never,
            input: toUpdateArgs(input) as never,
        });
        return toCeremlyEvent(updated);
    }

    async function deleteEvent(id: string): Promise<void> {
        await removeMutation.mutate({ eventId: id as never });
    }

    return { getEventOnce, updateEvent, deleteEvent };
}

/**
 * Singolo evento, vivo: `api.events.get` con l'id reattivo.
 *
 * Sostituisce `getEvent(id)` (una GET una-tantum): l'editor e le pagine evento
 * aggiornavano a mano dopo ogni salvataggio, e con due schede aperte la seconda
 * restava indietro.
 */
export function useEvent(eventId: MaybeRefOrGetter<string>) {
    const {
        data,
        error: queryError,
        isPending,
    } = useConvexQuery(
        api.events.get,
        () => ({ eventId: toValue(eventId) as never }),
        { server: false },
    );

    return {
        event: computed<CeremlyEvent | null>(() =>
            data.value ? toCeremlyEvent(data.value) : null),
        isLoading: isPending,
        error: computed<string | null>(() =>
            queryError.value ? convexErrorMessage(queryError.value) : null),
    };
}
