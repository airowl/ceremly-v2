ALTER TABLE "event_reminders" ADD COLUMN "processing_at" timestamp;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "variants_generated_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "event_reminders_event_daysbefore_uidx" ON "event_reminders" USING btree ("event_id", "days_before") WHERE "event_reminders"."sent_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_sha256_org_uidx" ON "file" USING btree ("sha256", "organization_id") WHERE "file"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_sha256_global_uidx" ON "file" USING btree ("sha256") WHERE "file"."organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_activities_guest_type_reminder_uidx" ON "guest_activities" USING btree ("guest_id", "type", ("meta"->>'reminderId')) WHERE "guest_activities"."type" = 'reminder_sent';
