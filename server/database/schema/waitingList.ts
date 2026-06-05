import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Waiting List table for pre-launch email collection
 * Tracks email, language, analytics/UTM data, and client info
 */
export const waitingList = pgTable("waiting_list", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    language: text("language").default("it").notNull(), // it | en
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Analytics tracking
    source: text("source"), // referrer URL
    utmSource: text("utm_source"), // utm_source param
    utmMedium: text("utm_medium"), // utm_medium param
    utmCampaign: text("utm_campaign"), // utm_campaign param
    // Client info
    ipAddress: text("ip_address"), // client IP
    userAgent: text("user_agent"), // browser user agent
});
