CREATE TYPE "public"."intake_session_status" AS ENUM('in_progress', 'matched', 'no_match', 'abandoned');--> statement-breakpoint
CREATE TABLE "intake_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar(50) NOT NULL,
	"user_id" uuid,
	"status" "intake_session_status" DEFAULT 'in_progress' NOT NULL,
	"detected_language" varchar(10),
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_sessions_active_channel_unique" ON "intake_sessions" USING btree ("channel_id") WHERE "intake_sessions"."status" = 'in_progress';