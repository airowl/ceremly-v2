ALTER TABLE "email_events" ADD COLUMN "svix_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_svix_id_uq" ON "email_events" USING btree ("svix_id");