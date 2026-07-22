import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// Append-only. type: 'sent'(seed) | 'delivered' | 'bounced' | 'complained'
// | 'delivery_delayed' | 'failed' | 'opened' | 'clicked'
// Idempotency is enforced at the DB layer via a unique index on `svix_id`
// (every Resend/Svix delivery carries a unique id). Redis dedup is a
// best-effort short-circuit only. The seed row (type='sent') has no svix_id.
export const emailEvents = pgTable("email_events", {
    id: text("id").primaryKey().$default(() => uuidv7()),
    svixId: text("svix_id"),
    messageId: text("message_id").notNull(),
    type: text("type").notNull(),
    recipient: text("recipient").notNull(),
    organizationId: text("organization_id"),
    emailType: text("email_type"),
    guestId: text("guest_id"),
    eventId: text("event_id"),
    clickedUrl: text("clicked_url"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    // Unique on svix_id: Postgres allows multiple NULLs, so seed rows (svix_id
    // NULL) and legacy rows are unaffected; only webhook deliveries are deduped.
    uniqueIndex("email_events_svix_id_uq").on(table.svixId),
    index("email_events_message_id_idx").on(table.messageId),
    index("email_events_organization_id_idx").on(table.organizationId),
    index("email_events_event_id_idx").on(table.eventId),
    index("email_events_type_idx").on(table.type),
]);
