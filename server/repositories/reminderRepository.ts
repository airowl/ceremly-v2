/**
 * Reminder Repository — Drizzle queries for Ceremly reminders (SPEC §6, owner B4).
 *
 * Organizer queries are org-scoped BY-CONSTRUCTION (WHERE organizationId),
 * following the eventRepository pattern. Cron queries (`findDueReminders`) are
 * cross-org by nature: they run in a system context (route protected by CRON_SECRET),
 * but the downstream functions (`findPendingGuestsForReminder`, `markReminderSent`)
 * remain org-scoped: the organizationId comes from the reminder row itself.
 */
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/** Item for the bulk upsert (validated by remindersSchema in the route layer). */
export interface ReminderUpsertItem {
    id?: string;
    daysBefore: number;
    subject: string;
    message: string;
    enabled: boolean;
}

/** Result of the bulk upsert (for audit details). */
export interface BulkUpsertRemindersResult {
    inserted: number;
    updated: number;
    deleted: number;
    /** Silently skipped items: ids already sent (immutable) or ids out of scope. */
    skipped: number;
}

/** Reminders for an event, org-scoped, max 3, ordered by daysBefore desc (R1 = furthest). */
export async function findRemindersByEvent(organizationId: string, eventId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.eventReminders)
        .where(
            and(
                eq(schema.eventReminders.organizationId, organizationId),
                eq(schema.eventReminders.eventId, eventId),
            ),
        )
        .orderBy(desc(schema.eventReminders.daysBefore))
        .limit(3);
}

/**
 * Bulk upsert of an event's reminders (SPEC §6 PUT /api/events/:id/reminders):
 *  - item with an id → update ONLY if the reminder exists in scope and
 *    sentAt is null (already-sent ones are immutable: silent skip);
 *  - item without id → insert;
 *  - existing reminders NOT referenced by the list → delete if sentAt is null
 *    (already-sent ones remain as history).
 * Sequential operations without a transaction (Neon HTTP driver: no
 * interactive transactions); volume is minimal (max 3 rows).
 */
export async function bulkUpsertReminders(
    organizationId: string,
    eventId: string,
    reminders: ReminderUpsertItem[],
): Promise<BulkUpsertRemindersResult> {
    const db = getDB();
    const existing = await db
        .select()
        .from(schema.eventReminders)
        .where(
            and(
                eq(schema.eventReminders.organizationId, organizationId),
                eq(schema.eventReminders.eventId, eventId),
            ),
        );
    const existingById = new Map(existing.map((r) => [r.id, r]));
    const referencedIds = new Set(
        reminders.flatMap((r) => (r.id ? [r.id] : [])),
    );

    const result: BulkUpsertRemindersResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0 };

    // Delete: existing ones not in the list, never sent.
    const idsToDelete = existing
        .filter((r) => !referencedIds.has(r.id) && r.sentAt === null)
        .map((r) => r.id);
    if (idsToDelete.length > 0) {
        await db
            .delete(schema.eventReminders)
            .where(
                and(
                    eq(schema.eventReminders.organizationId, organizationId),
                    eq(schema.eventReminders.eventId, eventId),
                    inArray(schema.eventReminders.id, idsToDelete),
                ),
            );
        result.deleted = idsToDelete.length;
    }

    for (const item of reminders) {
        if (item.id) {
            const current = existingById.get(item.id);
            if (!current || current.sentAt !== null) {
                // Unknown id in scope (no insert with client-provided id)
                // or reminder already sent (immutable): silent skip.
                result.skipped++;
                continue;
            }
            await db
                .update(schema.eventReminders)
                .set({
                    daysBefore: item.daysBefore,
                    subject: item.subject,
                    message: item.message,
                    enabled: item.enabled,
                })
                .where(
                    and(
                        eq(schema.eventReminders.id, item.id),
                        eq(schema.eventReminders.organizationId, organizationId),
                        eq(schema.eventReminders.eventId, eventId),
                        isNull(schema.eventReminders.sentAt),
                    ),
                );
            result.updated++;
        } else {
            await db.insert(schema.eventReminders).values({
                organizationId,
                eventId,
                daysBefore: item.daysBefore,
                subject: item.subject,
                message: item.message,
                enabled: item.enabled,
            });
            result.inserted++;
        }
    }
    return result;
}

/**
 * "Due" reminders for the daily cron (SPEC §6 GET /api/cron/send-reminders):
 * enabled, never sent, `active` event with a set rsvpDeadline and
 * now >= rsvpDeadline - daysBefore days (computed in SQL with interval).
 * Additional guard: now <= rsvpDeadline (past deadline the form is closed,
 * a reminder would be misleading). System query, cross-org by design.
 */
export async function findDueReminders() {
    const db = getDB();
    return db
        .select({
            id: schema.eventReminders.id,
            organizationId: schema.eventReminders.organizationId,
            eventId: schema.eventReminders.eventId,
            daysBefore: schema.eventReminders.daysBefore,
        })
        .from(schema.eventReminders)
        .innerJoin(schema.events, eq(schema.events.id, schema.eventReminders.eventId))
        .where(
            and(
                eq(schema.eventReminders.enabled, true),
                isNull(schema.eventReminders.sentAt),
                eq(schema.events.status, "active"),
                isNotNull(schema.events.rsvpDeadline),
                sql`now() >= ${schema.events.rsvpDeadline} - (${schema.eventReminders.daysBefore} * interval '1 day')`,
                sql`now() <= ${schema.events.rsvpDeadline}`,
            ),
        )
        .orderBy(schema.eventReminders.createdAt);
}

/**
 * Marks a reminder as sent (cron idempotency: WHERE sentAt IS NULL).
 * Org-scoped: the organizationId comes from the row found by findDueReminders.
 * Returns true if the row was actually marked.
 */
export async function markReminderSent(organizationId: string, id: string): Promise<boolean> {
    const db = getDB();
    const rows = await db
        .update(schema.eventReminders)
        .set({ sentAt: new Date() })
        .where(
            and(
                eq(schema.eventReminders.id, id),
                eq(schema.eventReminders.organizationId, organizationId),
                isNull(schema.eventReminders.sentAt),
            ),
        )
        .returning({ id: schema.eventReminders.id });
    return rows.length > 0;
}

/**
 * Guests who are recipients of a reminder (SPEC §6): with email, not removed,
 * remindersDisabled=false and WITHOUT an RSVP response (LEFT JOIN on rsvp_responses).
 * Ids only: the job handler re-fetches the full data.
 */
export async function findPendingGuestsForReminder(organizationId: string, eventId: string) {
    const db = getDB();
    return db
        .select({ id: schema.guests.id })
        .from(schema.guests)
        .leftJoin(schema.rsvpResponses, eq(schema.rsvpResponses.guestId, schema.guests.id))
        .where(
            and(
                eq(schema.guests.organizationId, organizationId),
                eq(schema.guests.eventId, eventId),
                isNull(schema.guests.removedAt),
                eq(schema.guests.remindersDisabled, false),
                isNotNull(schema.guests.email),
                ne(schema.guests.email, ""),
                isNull(schema.rsvpResponses.id),
            ),
        );
}
