/**
 * Reminder Service — logica di business dei reminder Ceremly (SPEC §6, owner B4).
 *
 * Pattern event.service:
 *   1. organizationId SEMPRE da event.context.organization (guard RBAC), mai da body/query.
 *   2. Query repository org-scoped by-construction.
 *   3. assertOwnership sull'evento come 2° guard.
 *   4. logAudit su ogni scrittura organizzatore ('reminder.updated').
 *
 * `processDueReminders` gira invece in contesto di sistema (Vercel Cron, nessun
 * utente): non audita (le consegne sono tracciate in guest_activities dal job
 * handler con type 'reminder_sent') e accoda 1 job 'send-reminder-email' per ospite.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { RemindersInput } from "~~/shared/schemas/ceremly";
import { getEventLimits } from "./eventAccess.service";
import {
    bulkUpsertReminders,
    findDueReminders,
    findPendingGuestsForReminder,
    findRemindersByEvent,
    markReminderSent,
} from "../repositories/reminderRepository";
import { findEventByIdScoped } from "../repositories/eventRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";
import { dispatch } from "../queue";

/** Concorrenza massima dei dispatch QStash per reminder (#6: evita timeout su liste grandi). */
const REMINDER_DISPATCH_CONCURRENCY = 10;

/** Legge l'org attiva dal context. 401 se assente (guard RBAC non eseguito). */
function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({
            statusCode: 401,
            statusMessage: "Organizzazione attiva non risolta",
        });
    }
    return orgId;
}

/** Evento scoped + assertOwnership: 2° guard comune a list/save. */
async function requireOwnedEvent(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
): Promise<{ organizationId: string; eventRow: NonNullable<Awaited<ReturnType<typeof findEventByIdScoped>>> }> {
    const organizationId = getOrgId(event);
    const row = await findEventByIdScoped(organizationId, eventId);
    const eventRow = assertOwnership(row, organizationId);
    return { organizationId, eventRow };
}

/** Lista reminder dell'evento (SPEC §6 GET /api/events/:id/reminders). */
export async function listReminders(event: H3Event<EventHandlerRequest>, eventId: string) {
    const { organizationId } = await requireOwnedEvent(event, eventId);
    const reminders = await findRemindersByEvent(organizationId, eventId);
    return { reminders };
}

/**
 * Bulk upsert dei reminder (SPEC §6 PUT /api/events/:id/reminders):
 * id presente → update se non inviato; assente → insert; esistenti non in
 * lista → delete se non inviati. I già inviati sono immutabili (skip silenzioso).
 * Valida il totale risultante (inviati conservati + aggiornati + nuovi) → 422
 * oltre MAX_REMINDERS.
 */
export async function saveReminders(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: RemindersInput,
) {
    const { organizationId, eventRow } = await requireOwnedEvent(event, eventId);
    const { maxReminders } = await getEventLimits(eventRow);

    // Validazione totale DOPO l'operazione: i reminder già inviati restano
    // sempre (anche se omessi dalla lista), quindi contano nel totale.
    const existing = await findRemindersByEvent(organizationId, eventId);
    const existingById = new Map(existing.map((r) => [r.id, r]));
    const sentKept = existing.filter((r) => r.sentAt !== null).length;
    let updatedUnsent = 0;
    let inserts = 0;
    for (const item of data.reminders) {
        if (!item.id) {
            inserts++;
            continue;
        }
        const current = existingById.get(item.id);
        // Id di un reminder inviato (già contato in sentKept) o sconosciuto
        // nello scope → skip silenzioso, non incide sul totale.
        if (current && current.sentAt === null) updatedUnsent++;
    }
    // -1 (atelier) = nessun limite reminder.
    if (maxReminders !== -1 && sentKept + updatedUnsent + inserts > maxReminders) {
        throw createError({
            statusCode: 422,
            statusMessage: `Puoi configurare al massimo ${maxReminders} reminder per evento.`,
        });
    }

    const result = await bulkUpsertReminders(organizationId, eventId, data.reminders);

    await logAudit(event, "reminder.updated", {
        organizationId,
        targetType: "event",
        targetId: eventId,
        details: { ...result },
    });

    const reminders = await findRemindersByEvent(organizationId, eventId);
    return { reminders };
}

/**
 * Processa i reminder dovuti (SPEC §6 GET /api/cron/send-reminders):
 * per ogni reminder dovuto → ospiti pendenti (con email, non removed,
 * remindersDisabled=false, senza risposta) → dispatch 'send-reminder-email'
 * per ciascuno → markReminderSent SUBITO dopo l'enqueue (idempotenza: un cron
 * che rigira nello stesso giorno non re-invia). Il lavoro pesante (render +
 * send email, activity 'reminder_sent') sta nel job handler, non qui (Strada A).
 */
export async function processDueReminders(): Promise<{ processed: number; queued: number }> {
    const due = await findDueReminders();
    let processed = 0;
    let queued = 0;

    for (const reminder of due) {
        const guests = await findPendingGuestsForReminder(
            reminder.organizationId,
            reminder.eventId,
        );
        // Dispatch concorrente a chunk (#6): un fallimento singolo NON aborta il
        // run (Promise.allSettled), così markReminderSent gira sempre e non si
        // ha re-invio di massa il giorno dopo; l'idempotenza handler/consumer
        // evita comunque doppioni. I chunk evitano il timeout su liste grandi.
        for (let i = 0; i < guests.length; i += REMINDER_DISPATCH_CONCURRENCY) {
            const chunk = guests.slice(i, i + REMINDER_DISPATCH_CONCURRENCY);
            const settled = await Promise.allSettled(
                chunk.map((g) => dispatch("send-reminder-email", { guestId: g.id, reminderId: reminder.id })),
            );
            settled.forEach((res, idx) => {
                if (res.status === "fulfilled") {
                    queued++;
                } else {
                    console.error(`[cron:send-reminders] dispatch fallito per guest ${chunk[idx]!.id} reminder ${reminder.id}:`, res.reason);
                }
            });
        }
        await markReminderSent(reminder.organizationId, reminder.id);
        processed++;
    }

    return { processed, queued };
}
