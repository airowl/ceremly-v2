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
import { CEREMLY_FREE_LIMITS } from "~~/shared/constants/pricing";
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

/**
 * Limite reminder per evento. Nell'MVP coincide per tutti i piani con il
 * valore Free (la UI ha 3 slot R1/R2/R3, remindersSchema accetta max 3):
 * nessun branching di piano necessario.
 */
const MAX_REMINDERS = CEREMLY_FREE_LIMITS.maxReminders;

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
): Promise<string> {
    const organizationId = getOrgId(event);
    const row = await findEventByIdScoped(organizationId, eventId);
    assertOwnership(row, organizationId);
    return organizationId;
}

/** Lista reminder dell'evento, max 3 (SPEC §6 GET /api/events/:id/reminders). */
export async function listReminders(event: H3Event<EventHandlerRequest>, eventId: string) {
    const organizationId = await requireOwnedEvent(event, eventId);
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
    const organizationId = await requireOwnedEvent(event, eventId);

    // Validazione max 3 TOTALI dopo l'operazione: i reminder già inviati
    // restano sempre (anche se omessi dalla lista), quindi contano nel totale.
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
    if (sentKept + updatedUnsent + inserts > MAX_REMINDERS) {
        throw createError({
            statusCode: 422,
            statusMessage: `Puoi configurare al massimo ${MAX_REMINDERS} reminder per evento.`,
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
        for (const guest of guests) {
            await dispatch("send-reminder-email", {
                guestId: guest.id,
                reminderId: reminder.id,
            });
            queued++;
        }
        await markReminderSent(reminder.organizationId, reminder.id);
        processed++;
    }

    return { processed, queued };
}
