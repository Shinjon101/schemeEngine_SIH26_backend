CREATE TYPE "public"."application_status" AS ENUM('recommended', 'dispatched', 'under_review', 'sanctioned', 'disbursed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."gender_eligibility" AS ENUM('all', 'women_only');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('active', 'quota_exhausted', 'suspended_high_npa', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."partner_type" AS ENUM('sca', 'psb', 'rrb', 'nbfc_mfi', 'cooperative_bank', 'small_finance_bank');--> statement-breakpoint
CREATE TYPE "public"."scheme_category" AS ENUM('micro_finance', 'term_loan', 'education_loan', 'skill_training', 'women_focused');--> statement-breakpoint
CREATE TYPE "public"."target_persona" AS ENUM('entrepreneur', 'student', 'women_entrepreneur', 'farmer', 'artisan', 'any');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('citizen', 'branch_admin', 'system_admin');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'recommended' NOT NULL,
	"requested_amount" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"partner_type" "partner_type" NOT NULL,
	"status" "partner_status" DEFAULT 'active' NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"address" text NOT NULL,
	"npa_ratio_percent" numeric(5, 2),
	"working_hours" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_scheme_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"scheme_id" uuid NOT NULL,
	"total_quota_amount" numeric(14, 2) NOT NULL,
	"utilized_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_interest_slabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"partner_type" "partner_type" NOT NULL,
	"beneficiary_rate_percent" numeric(5, 2) NOT NULL,
	"nsfdc_rate_percent" numeric(5, 2)
);
--> statement-breakpoint
CREATE TABLE "scheme_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"input_profile" jsonb NOT NULL,
	"recommended_scheme_id" uuid NOT NULL,
	"match_score" numeric(5, 2),
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"category" "scheme_category" NOT NULL,
	"description" text NOT NULL,
	"min_loan_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_loan_amount" numeric(12, 2) NOT NULL,
	"max_project_cost_coverage_percent" integer DEFAULT 90 NOT NULL,
	"interest_rate_min_percent" numeric(5, 2) NOT NULL,
	"interest_rate_max_percent" numeric(5, 2) NOT NULL,
	"moratorium_months_min" integer DEFAULT 3 NOT NULL,
	"moratorium_months_max" integer DEFAULT 12 NOT NULL,
	"repayment_tenure_months" integer NOT NULL,
	"max_annual_family_income" numeric(12, 2) NOT NULL,
	"gender_eligibility" "gender_eligibility" DEFAULT 'all' NOT NULL,
	"target_persona" "target_persona" DEFAULT 'any' NOT NULL,
	"min_age" integer,
	"max_age" integer,
	"eligibility_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_url" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" DEFAULT 'citizen' NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"phone" varchar(15) NOT NULL,
	"email" varchar(150),
	"password_hash" text,
	"managed_partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_scheme_quotas" ADD CONSTRAINT "partner_scheme_quotas_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_scheme_quotas" ADD CONSTRAINT "partner_scheme_quotas_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_interest_slabs" ADD CONSTRAINT "scheme_interest_slabs_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_recommendations" ADD CONSTRAINT "scheme_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_recommendations" ADD CONSTRAINT "scheme_recommendations_recommended_scheme_id_schemes_id_fk" FOREIGN KEY ("recommended_scheme_id") REFERENCES "public"."schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_managed_partner_id_channel_partners_id_fk" FOREIGN KEY ("managed_partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_scheme_unique" ON "partner_scheme_quotas" USING btree ("partner_id","scheme_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheme_partner_type_unique" ON "scheme_interest_slabs" USING btree ("scheme_id","partner_type");--> statement-breakpoint
CREATE UNIQUE INDEX "schemes_code_unique" ON "schemes" USING btree ("code");