DO $$ BEGIN
	CREATE TYPE "public"."reported_outcome" AS ENUM('received_loan', 'not_received', 'still_pending');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partner_outcome_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"application_id" uuid,
	"user_id" uuid,
	"outcome" "reported_outcome" NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "partner_outcome_reports" ADD CONSTRAINT "partner_outcome_reports_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "partner_outcome_reports" ADD CONSTRAINT "partner_outcome_reports_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "partner_outcome_reports" ADD CONSTRAINT "partner_outcome_reports_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "partner_outcome_reports" ADD CONSTRAINT "partner_outcome_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_outcome_reports_partner_scheme_idx" ON "partner_outcome_reports" USING btree ("partner_id","scheme_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_partners_name_unique" ON "channel_partners" USING btree ("name");