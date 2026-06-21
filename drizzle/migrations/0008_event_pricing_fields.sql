ALTER TABLE "events" ADD COLUMN "tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "unlocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "creem_order_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "creem_checkout_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cleanup_warned_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "events_creem_order_id_idx" ON "events" USING btree ("creem_order_id");