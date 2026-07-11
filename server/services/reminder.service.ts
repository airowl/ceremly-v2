/**
 * Reminder Service — business logic for Ceremly reminders (SPEC §6, owner B4).
 *
 * Pattern event.service:
 *   1. organizationId ALWAYS from event.context.organization (RBAC guard), never from body/query.
 *   2. Repository queries org-scoped by-construction.
 *   3. assertOwnership on the event as 2nd guard.
 *   4. logAudit on every organizer write ('reminder.updated').
 *
 * `processDueReminders` runs in system context instead (Vercel Cron, no user):
 * it does not audit (deliveries are tracked in guest_activities by the job
 * handler with type 'reminder_sent') and enqueues 1 'send-reminder-email' job per guest.
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

/** Maximum QStash dispatch concurrency for reminders (#6: avoids timeout on large lists). */
const REMINDER_DISPATCH_CONCURRENCY = 10;

/** Reads the active org from context. 401 if absent (RBAC guard not executed). */
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

/** Scoped event + assertOwnership: 2nd guard common to list/save. */
async function requireOwnedEvent(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
): Promise<{ organizationId: string; eventRow: NonNullable<Awaited<ReturnType<typeof findEventByIdScoped>>> }> {
    const organizationId = getOrgId(event);
    const row = await findEventByIdScoped(organizationId, eventId);
    const eventRow = assertOwnership(row, organizationId);
    return { organizationId, eventRow };
}

/** Lists event reminders (SPEC §6 GET /api/events/:id/reminders). */
export async function listReminders(event: H3Event<EventHandlerRequest>, eventId: string) {
    const { organizationId } = await requireOwnedEvent(event, eventId);
    const reminders = await findRemindersByEvent(organizationId, eventId);
    return { reminders };
}

/**
 * Bulk upsert of reminders (SPEC §6 PUT /api/events/:id/reminders):
 * id present → update if not sent; absent → insert; existing not in
 * list → delete if not sent. Already-sent reminders are immutable (silent skip).
 * Validates the resulting total (sent kept + updated + new) → 422
 * above MAX_REMINDERS.
 */
export async function saveReminders(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: RemindersInput,
) {
    const { organizationId, eventRow } = await requireOwnedEvent(event, eventId);
    const { maxReminders } = await getEventLimits(eventRow);

    // Full validation AFTER the operation: already-sent reminders always remain
    // (even if omitted from the list), so they count toward the total.
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
        // Id of an already-sent reminder (already counted in sentKept) or unknown
        // in scope → silent skip, does not affect the total.
        if (current && current.sentAt === null) updatedUnsent++;
    }
    // -1 (atelier) = no reminder limit.
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
 * Processes due reminders (SPEC §6 GET /api/cron/send-reminders):
 * for each due reminder → pending guests (with email, not removed,
 * remindersDisabled=false, no response) → dispatch 'send-reminder-email'
 * for each → markReminderSent IMMEDIATELY after enqueue (idempotency: a cron
 * re-running the same day does not re-send). Heavy work (render +
 * send email, activity 'reminder_sent') lives in the job handler, not here (Strada A).
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
        // Concurrent dispatch in chunks (#6): a single failure does NOT abort the
        // run (Promise.allSettled), so a PARTIAL failure still marks the reminder
        // sent and there is no mass re-send the next day; handler/consumer
        // idempotency prevents duplicates regardless. Chunks avoid timeout on
        // large lists.
        let enqueuedForReminder = 0;
        for (let i = 0; i < guests.length; i += REMINDER_DISPATCH_CONCURRENCY) {
            const chunk = guests.slice(i, i + REMINDER_DISPATCH_CONCURRENCY);
            const settled = await Promise.allSettled(
                chunk.map((g) => dispatch("send-reminder-email", { guestId: g.id, reminderId: reminder.id })),
            );
            settled.forEach((res, idx) => {
                if (res.status === "fulfilled") {
                    queued++;
                    enqueuedForReminder++;
                } else {
                    console.error(`[cron:send-reminders] dispatch failed for guest ${chunk[idx]!.id} reminder ${reminder.id}:`, res.reason);
                }
            });
        }
        // TOTAL enqueue failure (e.g. QStash outage during the cron run): leave
        // the reminder unsent so tomorrow's run retries it while still inside
        // the daysBefore window — marking it sent would silently lose it forever.
        if (guests.length > 0 && enqueuedForReminder === 0) {
            console.error(`[cron:send-reminders] all ${guests.length} dispatches failed for reminder ${reminder.id}; NOT marking sent (next run retries)`);
            continue;
        }
        await markReminderSent(reminder.organizationId, reminder.id);
        processed++;
    }

    return { processed, queued };
}
