CREATE TABLE "email_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"bounce_subtype" text,
	"source" text DEFAULT 'resend_webhook' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"organization_id" text,
	"email_type" text,
	"guest_id" text,
	"event_id" text,
	"clicked_url" text,
	"payload" jsonb,
	"occurred_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_events_message_id_idx" ON "email_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_events_organization_id_idx" ON "email_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "email_events_event_id_idx" ON "email_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "email_events_type_idx" ON "email_events" USING btree ("type");