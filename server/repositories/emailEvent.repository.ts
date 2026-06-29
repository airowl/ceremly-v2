import { eq, sql } from "drizzle-orm";
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
        .limit(1);
    return rows[0];
}

export async function insertEmailEvent(input: {
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
}): Promise<void> {
    const db = getDB();
    await db.insert(schema.emailEvents).values({
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
    });
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
