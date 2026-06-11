/**
 * Reminder Repository — query Drizzle per i reminder Ceremly (SPEC §6, owner B4).
 *
 * Le query organizzatore sono org-scoped BY-CONSTRUCTION (WHERE organizationId),
 * pattern eventRepository. Le query del cron (`findDueReminders`) sono per natura
 * cross-org: girano in contesto di sistema (route protetta da CRON_SECRET), ma le
 * funzioni a valle (`findPendingGuestsForReminder`, `markReminderSent`) restano
 * comunque org-scoped: l'organizationId arriva dalla riga reminder stessa.
 */
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

/** Item del bulk upsert (validato da remindersSchema nel route layer). */
export interface ReminderUpsertItem {
    id?: string;
    daysBefore: number;
    subject: string;
    message: string;
    enabled: boolean;
}

/** Esito del bulk upsert (per audit details). */
export interface BulkUpsertRemindersResult {
    inserted: number;
    updated: number;
    deleted: number;
    /** Item saltati silenziosamente: id già inviati (immutabili) o id fuori scope. */
    skipped: number;
}

/** Reminder di un evento, org-scoped, max 3, ordinati daysBefore desc (R1 = più lontano). */
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
 * Bulk upsert dei reminder di un evento (SPEC §6 PUT /api/events/:id/reminders):
 *  - item con id presente → update SOLO se il reminder esiste nello scope e
 *    sentAt è null (i già inviati sono immutabili: skip silenzioso);
 *  - item senza id → insert;
 *  - reminder esistenti NON referenziati dalla lista → delete se sentAt null
 *    (i già inviati restano come storico).
 * Operazioni sequenziali senza transazione (driver Neon HTTP: niente
 * transazioni interattive); il volume è minimo (max 3 righe).
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

    // Delete: esistenti non in lista, mai inviati.
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
                // Id sconosciuto nello scope (no insert con id client-provided)
                // o reminder già inviato (immutabile): skip silenzioso.
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
 * Reminder "dovuti" per il cron giornaliero (SPEC §6 GET /api/cron/send-reminders):
 * enabled, mai inviati, evento `active` con rsvpDeadline valorizzata e
 * now >= rsvpDeadline - daysBefore giorni (calcolo in SQL con interval).
 * Guard aggiuntivo: now <= rsvpDeadline (a deadline passata il form è chiuso,
 * un reminder sarebbe fuorviante). Query di sistema, cross-org by design.
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
 * Marca un reminder come inviato (idempotenza cron: WHERE sentAt IS NULL).
 * Org-scoped: l'organizationId arriva dalla riga trovata da findDueReminders.
 * Ritorna true se la riga è stata effettivamente marcata.
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
 * Ospiti destinatari di un reminder (SPEC §6): con email, non removed,
 * remindersDisabled=false e SENZA risposta RSVP (LEFT JOIN su rsvp_responses).
 * Solo gli id: il job handler ri-fetcha i dati completi.
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
