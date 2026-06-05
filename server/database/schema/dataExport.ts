import { relations } from "drizzle-orm";
import {
    index,
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Export status types
export const EXPORT_STATUS = ["pending", "processing", "completed", "failed", "expired"] as const;
export type ExportStatus = typeof EXPORT_STATUS[number];

export const dataExports = pgTable(
    "data_exports",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        status: text("status").$type<ExportStatus>().default("pending").notNull(),
        format: text("format").default("json").notNull(),
        downloadUrl: text("download_url"),
        downloadToken: text("download_token").unique(),
        expiresAt: timestamp("expires_at"),
        completedAt: timestamp("completed_at"),
        errorMessage: text("error_message"),
        fileSize: integer("file_size"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [
        index("data_exports_user_id_idx").on(table.userId),
        index("data_exports_status_idx").on(table.status),
        index("data_exports_download_token_idx").on(table.downloadToken),
    ],
);

// Relations
export const dataExportsRelations = relations(dataExports, ({ one }) => ({
    user: one(user, {
        fields: [dataExports.userId],
        references: [user.id],
    }),
}));

// Types
export type DataExport = typeof dataExports.$inferSelect;
export type NewDataExport = typeof dataExports.$inferInsert;
