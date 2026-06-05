import { relations } from "drizzle-orm";
import {
    boolean,
    date,
    index,
    integer,
    pgTable,
    text,
    time,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";

export const events = pgTable(
    "events",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        /** Owner of the event (equivalent to former workspace ownerId) */
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        slug: text("slug").notNull(),
        description: text("description"),
        date: date("date").notNull(),
        time: time("time"),
        location: text("location"),
        address: text("address"),
        deadline: date("deadline"),
        primaryColor: text("primary_color").default("#6366f1").notNull(),
        showGuestCount: boolean("show_guest_count").default(true).notNull(),
        socialProofEnabled: boolean("social_proof_enabled").default(false).notNull(),
        maxGuests: integer("max_guests").default(20).notNull(),
        autoConfirmRegistration: boolean("auto_confirm_registration").default(
            false,
        ).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
        deletedAt: timestamp("deleted_at"),
    },
    (table) => [
        index("events_user_id_idx").on(table.userId),
        index("events_date_idx").on(table.date),
        uniqueIndex("events_slug_unique").on(table.slug),
    ],
);

/**
 * Event team members table (replaces workspace_users)
 * Role: 'editor' | 'viewer' (owner is implicit from events.userId)
 */
export const eventUsers = pgTable(
    "event_users",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        eventId: text("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        role: text("role").default("viewer").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("event_users_event_id_idx").on(table.eventId),
        index("event_users_user_id_idx").on(table.userId),
    ],
);

/**
 * Invitations table - team invitations scoped to events
 */
export const invitations = pgTable(
    "invitations",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        eventId: text("event_id")
            .notNull()
            .references(() => events.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        token: text("token").notNull().unique(),
        invitedById: text("invited_by_id").references(() => user.id, { onDelete: "set null" }),
        status: text("status").default("pending").notNull(), // pending, accepted, expired, cancelled
        expiresAt: timestamp("expires_at").notNull(),
        acceptedAt: timestamp("accepted_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("invitations_event_id_idx").on(table.eventId),
        index("invitations_email_idx").on(table.email),
        index("invitations_token_idx").on(table.token),
    ],
);

// Import child tables for relations
import { guests } from "./guest";
import { landingPages } from "./landingPage";
import { registrationPages } from "./registrationPage";
import { reminderTemplates } from "./reminderTemplate";

export const eventsRelations = relations(events, ({ one, many }) => ({
    owner: one(user, {
        fields: [events.userId],
        references: [user.id],
    }),
    members: many(eventUsers),
    invitations: many(invitations),
    guests: many(guests),
    landingPage: one(landingPages),
    registrationPage: one(registrationPages),
    reminderTemplates: many(reminderTemplates),
}));

export const eventUsersRelations = relations(eventUsers, ({ one }) => ({
    event: one(events, {
        fields: [eventUsers.eventId],
        references: [events.id],
    }),
    user: one(user, {
        fields: [eventUsers.userId],
        references: [user.id],
    }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
    event: one(events, {
        fields: [invitations.eventId],
        references: [events.id],
    }),
    invitedBy: one(user, {
        fields: [invitations.invitedById],
        references: [user.id],
    }),
}));
