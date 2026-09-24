import { useConvexMutation, useConvexQuery } from "convex-vue";
import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Doc } from "~~/convex/_generated/dataModel";
import { convexErrorMessage } from "~/composables/useConvexError";
import { isoOrNull } from "~/composables/useEvents";
import type { EventReminderData } from "~~/shared/types/ceremly";

/**
 * useEventReminders — Task 14, part a: i reminder RSVP dell'evento.
 *
 * La pagina reminder era l'ultima delle pagine ospiti/RSVP a leggere e scrivere
 * con `$fetch` (`GET`/`PUT /api/events/:id/reminders`) direttamente nel
 * componente, dove il gate del data layer non guarda. La lista è una query viva:
 * la pagina la copia nel form **solo** quando non ci sono modifiche in corso (la
 * stessa sentinella del pulsante Salva), così un reminder inviato dal cron mentre
 * la pagina è aperta cambia stato da solo senza cancellare ciò che l'utente scrive.
 */

/** Riga Convex (millisecondi) → shape della pagina (ISO). */
export function toEventReminderData(row: Doc<"eventReminders">): EventReminderData {
    return {
        id: row._id,
        daysBefore: row.daysBefore,
        subject: row.subject,
        message: row.message,
        enabled: row.enabled,
        sentAt: isoOrNull(row.sentAt),
    };
}

export interface SaveReminderInput {
    id?: string;
    daysBefore: number;
    subject: string;
    message: string;
    enabled: boolean;
}

export function useEventReminders(eventId: MaybeRefOrGetter<string>) {
    const retryNonce = ref(0);

    const { data, error, isPending } = useConvexQuery(
        api.reminders.list,
        () => {
            void retryNonce.value;
            return { eventId: toValue(eventId) as never };
        },
        { server: false },
    );

    const saveMutation = useConvexMutation(api.reminders.save);

    /** Bulk upsert (la lista è la verità; gli inviati restano immutabili lato server). */
    async function saveReminders(reminders: SaveReminderInput[]): Promise<EventReminderData[]> {
        const saved = await saveMutation.mutate({
            eventId: toValue(eventId) as never,
            reminders: reminders.map(({ id, ...rest }) => (id ? { id, ...rest } : rest)),
        });
        return saved.map(toEventReminderData);
    }

    return {
        reminders: computed<EventReminderData[] | null>(() =>
            data.value ? data.value.map(toEventReminderData) : null),
        isLoading: isPending,
        error: computed<string | null>(() => (error.value ? convexErrorMessage(error.value) : null)),
        retry: () => {
            retryNonce.value += 1;
        },
        saveReminders,
    };
}
