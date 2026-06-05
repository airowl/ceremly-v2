CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"event_id" text,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'success' NOT NULL,
	"details" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creem_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"creem_customer_id" text,
	"creem_subscription_id" text,
	"creem_order_id" text,
	"status" text DEFAULT 'pending',
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"creem_customer_id" text,
	"had_trial" boolean DEFAULT false,
	"locale" text DEFAULT 'it',
	"timezone" text,
	"tos_accepted_at" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"language" text DEFAULT 'it' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"format" text DEFAULT 'json' NOT NULL,
	"download_url" text,
	"download_token" text,
	"expires_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_exports_download_token_unique" UNIQUE("download_token")
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"original_name" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"url" text,
	"storage_provider" text DEFAULT 'r2' NOT NULL,
	"uploaded_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"upload_status" text DEFAULT 'active' NOT NULL,
	"presign_expires_at" timestamp,
	"is_public" boolean DEFAULT true NOT NULL,
	"event_id" text,
	"sha256" text,
	"variant_of" uuid,
	"variant_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_custom_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"max_events" integer,
	"storage_mb" integer,
	"team_members" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_custom_limits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "waiting_list" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"language" text DEFAULT 'it' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"source" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"ip_address" text,
	"user_agent" text,
	CONSTRAINT "waiting_list_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "event_users" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"time" time,
	"location" text,
	"address" text,
	"deadline" date,
	"primary_color" text DEFAULT '#6366f1' NOT NULL,
	"show_guest_count" boolean DEFAULT true NOT NULL,
	"social_proof_enabled" boolean DEFAULT false NOT NULL,
	"max_guests" integer DEFAULT 20 NOT NULL,
	"auto_confirm_registration" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"invited_by_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"group" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"custom_fields" jsonb,
	"responded_at" timestamp,
	"last_email_sent_at" timestamp,
	"email_sent_count" integer DEFAULT 0 NOT NULL,
	"last_whatsapp_clicked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"template_id" text,
	"type" text NOT NULL,
	"resend_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"data" jsonb NOT NULL,
	"thumbnail_url" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_limits" ADD CONSTRAINT "user_custom_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_users" ADD CONSTRAINT "event_users_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_users" ADD CONSTRAINT "event_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_pages" ADD CONSTRAINT "registration_pages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_templates" ADD CONSTRAINT "reminder_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_template_id_reminder_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."reminder_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_event_id_idx" ON "audit_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "audit_log_category_idx" ON "audit_log" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "data_exports_user_id_idx" ON "data_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_exports_status_idx" ON "data_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_exports_download_token_idx" ON "data_exports" USING btree ("download_token");--> statement-breakpoint
CREATE INDEX "file_event_id_idx" ON "file" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "file_sha256_idx" ON "file" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "file_variant_of_idx" ON "file" USING btree ("variant_of");--> statement-breakpoint
CREATE INDEX "file_upload_status_idx" ON "file" USING btree ("upload_status");--> statement-breakpoint
CREATE INDEX "event_users_event_id_idx" ON "event_users" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_users_user_id_idx" ON "event_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "invitations_event_id_idx" ON "invitations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "guests_event_id_idx" ON "guests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "guests_status_idx" ON "guests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "guests_source_idx" ON "guests" USING btree ("source");--> statement-breakpoint
CREATE INDEX "guests_email_idx" ON "guests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "guests_group_idx" ON "guests" USING btree ("group");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_event_id_unique" ON "landing_pages" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_pages_event_id_unique" ON "registration_pages" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reminder_templates_event_id_idx" ON "reminder_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reminder_templates_type_idx" ON "reminder_templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "email_logs_guest_id_idx" ON "email_logs" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "email_logs_template_id_idx" ON "email_logs" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "email_logs_type_idx" ON "email_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "event_templates_user_id_idx" ON "event_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_templates_category_idx" ON "event_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "event_templates_is_system_idx" ON "event_templates" USING btree ("is_system");