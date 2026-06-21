import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { EventDistribution, InviteBlock, RsvpQuestion } from "~~/shared/types/ceremly";
import { organization } from "./auth";

/**
 * Eventi Ceremly (SPEC §2) — entità radice del dominio inviti.
 * Org-scoped come projects: organizationId NOT NULL + indice, cascade delete.
 * slug UNIQUE per URL pubblici `/e/{slug}/{token}`; blocks/rsvpConfig/distribution
 * sono jsonb tipizzati con le shape condivise di shared/types/ceremly (SPEC §3).
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
        title: text("title").notNull(),
        slug: text("slug").notNull().unique(),
        eventDate: timestamp("event_date"),
        eventTime: text("event_time"), // es. "16:00" (solo display)
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
        // Pricing per-evento (Fase 1). `tier` è SOLO lo stato one-time dell'evento
        // ('free' | 'celebration'); 'atelier' NON è un valore di tier (è una
        // proprietà dell'org/owner risolta a runtime). creemOrderId ricollega un
        // refund.created all'evento da re-lockare; cleanupWarnedAt traccia l'email
        // di avviso del cron di cleanup. creemCheckoutId è persistito alla creazione
        // del checkout (Fase 7, fix critical): permette la reconciliation via
        // retrieveCheckout(checkoutId) quando il webhook fire-and-forget perde lo sblocco.
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
    ],
);

export const eventsRelations = relations(events, ({ one }) => ({
    organization: one(organization, {
        fields: [events.organizationId],
        references: [organization.id],
    }),
}));
