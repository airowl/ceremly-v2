import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { EventDistribution, InviteBlock, RsvpQuestion } from "~~/shared/types/ceremly";
import type { InviteTheme } from "~~/shared/constants/inviteTheme";
import { organization } from "./auth";

/**
 * Ceremly events (SPEC §2) — root entity of the invite domain.
 * Org-scoped like projects: organizationId NOT NULL + index, cascade delete.
 * slug UNIQUE for public URLs `/e/{slug}/{token}`; blocks/rsvpConfig/distribution
 * are typed jsonb with the shared shapes from shared/types/ceremly (SPEC §3).
 */
export const events = pgTable(
    "events",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        type: text("type").notNull(), // matrimonio | laurea | compleanno | battesimo
        templateKey: text("template_key").notNull(),
        // Custom invite theme: 4 hex colors (InviteTheme). NULL ⇒ global tokens
        // of the .cer design system (look "toscana"), so pre-existing events
        // remain unchanged. inviteFont = font family name from the catalog (or NULL).
        theme: jsonb("theme").$type<InviteTheme>(),
        inviteFont: text("invite_font"),
        title: text("title").notNull(),
        slug: text("slug").notNull().unique(),
        eventDate: timestamp("event_date"),
        eventTime: text("event_time"), // e.g. "16:00" (display only)
        locationName: text("location_name"),
        locationAddress: text("location_address"),
        status: text("status").default("draft").notNull(), // draft | active | closed
        blocks: jsonb("blocks").$type<InviteBlock[]>().default([]).notNull(),
        rsvpConfig: jsonb("rsvp_config").$type<RsvpQuestion[]>().default([]).notNull(),
        rsvpDeadline: timestamp("rsvp_deadline"),
        rsvpClosedMessage: text("rsvp_closed_message"),
        distribution: jsonb("distribution")
            .$type<EventDistribution>()
            .default({} as EventDistribution)
            .notNull(),
        // Per-event pricing (Phase 1). `tier` is ONLY the one-time state of the event
        // ('free' | 'celebration'); 'atelier' is NOT a tier value (it is a
        // property of the org/owner resolved at runtime). creemOrderId links a
        // refund.created back to the event to re-lock it; cleanupWarnedAt tracks the
        // warning email from the cleanup cron. creemCheckoutId is persisted at checkout
        // creation (Phase 7, critical fix): allows reconciliation via
        // retrieveCheckout(checkoutId) when the fire-and-forget webhook loses the unlock.
        tier: text("tier").notNull().default("free"),
        unlockedAt: timestamp("unlocked_at"),
        creemOrderId: text("creem_order_id"),
        creemCheckoutId: text("creem_checkout_id"),
        cleanupWarnedAt: timestamp("cleanup_warned_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("events_organization_id_idx").on(table.organizationId),
        // Fix 7.5 (final review): relockEventByOrder(creemOrderId) was doing a full table
        // scan; unique index — one Creem order unlocks exactly one event, so
        // uniqueness is also a correctness constraint (Postgres allows multiple NULLs).
        uniqueIndex("events_creem_order_id_idx").on(table.creemOrderId),
    ],
);

export const eventsRelations = relations(events, ({ one }) => ({
    organization: one(organization, {
        fields: [events.organizationId],
        references: [organization.id],
    }),
}));
