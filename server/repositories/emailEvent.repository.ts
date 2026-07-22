import { and, eq, isNull, sql } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function insertEmailSeed(input: {
    messageId: string;
    recipient: string;
    emailType: string;
    organizationId?: string;
    guestId?: string;
    eventId?: string;
}): Promise<void> {
    const db = getDB();
    await db.insert(schema.emailEvents).values({
        messageId: input.messageId,
        type: "sent",
        recipient: input.recipient,
        emailType: input.emailType,
        organizationId: input.organizationId,
        guestId: input.guestId,
        eventId: input.eventId,
        occurredAt: new Date(),
    });

    // Backfill: webhook events for this message may have arrived BEFORE the seed
    // (race). Re-correlate any orphan rows (context still null) with the now-known
    // entity ids. Idempotent: only touches rows whose organization_id IS NULL.
    if (input.organizationId || input.guestId || input.eventId) {
        await db
            .update(schema.emailEvents)
            .set({
                organizationId: input.organizationId,
                guestId: input.guestId,
                eventId: input.eventId,
                emailType: input.emailType,
            })
            .where(and(
                eq(schema.emailEvents.messageId, input.messageId),
                isNull(schema.emailEvents.organizationId),
            ));
    }
}

export async function findSeedContext(messageId: string) {
    const db = getDB();
    const rows = await db
        .select({
            organizationId: schema.emailEvents.organizationId,
            guestId: schema.emailEvents.guestId,
            eventId: schema.emailEvents.eventId,
            emailType: schema.emailEvents.emailType,
        })
        .from(schema.emailEvents)
        .where(eq(schema.emailEvents.messageId, messageId))
        .orderBy(schema.emailEvents.createdAt)
        .limit(1);
    return rows[0];
}

export async function insertEmailEvent(input: {
    svixId: string;
    messageId: string;
    type: string;
    recipient: string;
    occurredAt: Date;
    payload: unknown;
    clickedUrl?: string;
    organizationId?: string | null;
    guestId?: string | null;
    eventId?: string | null;
    emailType?: string | null;
}): Promise<{ inserted: boolean }> {
    const db = getDB();
    // onConflictDoNothing on the svix_id unique index: a duplicate delivery is a
    // no-op. `returning()` yields the inserted rows — empty means it was a dup.
    const rows = await db
        .insert(schema.emailEvents)
        .values({
            svixId: input.svixId,
            messageId: input.messageId,
            type: input.type,
            recipient: input.recipient,
            occurredAt: input.occurredAt,
            payload: input.payload as object,
            clickedUrl: input.clickedUrl,
            organizationId: input.organizationId ?? undefined,
            guestId: input.guestId ?? undefined,
            eventId: input.eventId ?? undefined,
            emailType: input.emailType ?? undefined,
        })
        .onConflictDoNothing({ target: schema.emailEvents.svixId })
        .returning({ id: schema.emailEvents.id });
    return { inserted: rows.length > 0 };
}

// Updates the open counters on the guest (columns already present on `guests`).
export async function recordGuestOpen(guestId: string, occurredAt: Date): Promise<void> {
    const db = getDB();
    await db
        .update(schema.guests)
        .set({
            openCount: sql`${schema.guests.openCount} + 1`,
            emailOpenedAt: occurredAt,
            firstOpenedAt: sql`COALESCE(${schema.guests.firstOpenedAt}, ${occurredAt})`,
        })
        .where(eq(schema.guests.id, guestId));
}
