ALTER TABLE "channel_partners"
ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "partner_scheme_quotas"
ADD COLUMN IF NOT EXISTS "accepting_applications" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "partner_scheme_quotas"
ADD COLUMN IF NOT EXISTS "last_reported_at" timestamp with time zone;