import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { guests } from "./guest";
import { reminderTemplates } from "./reminderTemplate";

export type EmailLogTypeDB = "invitation" | "reminder" | "registration_confirm";
export type EmailStatusDB = "sent" | "delivered" | "bounced" | "failed";

export const emailLogs = pgTable(
  "email_logs",
  {
    id: text("id").primaryKey().$default(() => uuidv7()),
    guestId: text("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .references(() => reminderTemplates.id, { onDelete: "set null" }),
    type: text("type").$type<EmailLogTypeDB>().notNull(),
    resendMessageId: text("resend_message_id"),
    status: text("status").$type<EmailStatusDB>().default("sent").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_logs_guest_id_idx").on(table.guestId),
    index("email_logs_template_id_idx").on(table.templateId),
    index("email_logs_type_idx").on(table.type),
    index("email_logs_sent_at_idx").on(table.sentAt),
  ],
);

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  guest: one(guests, {
    fields: [emailLogs.guestId],
    references: [guests.id],
  }),
  template: one(reminderTemplates, {
    fields: [emailLogs.templateId],
    references: [reminderTemplates.id],
  }),
}));
