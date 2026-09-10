import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const schemeCategoryEnum = pgEnum("scheme_category", [
  "micro_finance",
  "term_loan",
  "education_loan",
  "skill_training",
  "women_focused",
]);

export const reportedOutcomeEnum = pgEnum("reported_outcome", [
  "received_loan",
  "not_received",
  "still_pending",
]);

export const targetPersonaEnum = pgEnum("target_persona", [
  "entrepreneur",
  "student",
  "women_entrepreneur",
  "farmer",
  "artisan",
  "any",
]);

export const genderEligibilityEnum = pgEnum("gender_eligibility", [
  "all",
  "women_only",
]);

export const partnerTypeEnum = pgEnum("partner_type", [
  "sca", // State Channelizing Agency
  "psb", // Public Sector Bank
  "rrb", // Regional Rural Bank
  "nbfc_mfi",
  "cooperative_bank",
  "small_finance_bank",
]);

export const partnerStatusEnum = pgEnum("partner_status", [
  "active",
  "quota_exhausted",
  "suspended_high_npa",
  "inactive",
]);

export const userRoleEnum = pgEnum("user_role", [
  "citizen",
  "branch_admin",
  "system_admin",
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "recommended",
  "dispatched",
  "under_review",
  "sanctioned",
  "disbursed",
  "rejected",
]);

// Status of a multi-turn citizen intake conversation. "in_progress" is
// the only status the unique partial index below treats as "active" —
// once a session resolves (matched/no_match) or times out (abandoned),
// a new message on the same channel starts a fresh session rather than
// reusing the closed one.
export const intakeSessionStatusEnum = pgEnum("intake_session_status", [
  "in_progress",
  "matched",
  "no_match",
  "abandoned",
]);

export interface SchemeEligibilityRules {
  // Free-form nuanced clauses the LLM reads as context, e.g.
  // { requiresCourseRecognition: true, excludesPriorDefaulters: true }
  [rule: string]: unknown;
}

export interface CitizenInputProfile {
  annualFamilyIncome: number;
  age: number;
  gender: "male" | "female" | "other";
  projectType: string;
  intent: "business_loan" | "education_loan" | "skill_training";
  estimatedProjectCost?: number;
  educationStatus?: "none" | "secondary" | "graduate" | "postgraduate";
}

export const schemes = pgTable(
  "schemes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    code: varchar("code", { length: 20 }).notNull(), // e.g. "MCF", "TL", "ELS"
    name: varchar("name", { length: 150 }).notNull(),
    category: schemeCategoryEnum("category").notNull(),
    description: text("description").notNull(),

    minLoanAmount: numeric("min_loan_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    maxLoanAmount: numeric("max_loan_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    maxProjectCostCoveragePercent: integer("max_project_cost_coverage_percent")
      .notNull()
      .default(90),

    interestRateMinPercent: numeric("interest_rate_min_percent", {
      precision: 5,
      scale: 2,
    }).notNull(),
    interestRateMaxPercent: numeric("interest_rate_max_percent", {
      precision: 5,
      scale: 2,
    }).notNull(),

    moratoriumMonthsMin: integer("moratorium_months_min").notNull().default(3),
    moratoriumMonthsMax: integer("moratorium_months_max").notNull().default(12),
    repaymentTenureMonths: integer("repayment_tenure_months").notNull(),

    maxAnnualFamilyIncome: numeric("max_annual_family_income", {
      precision: 12,
      scale: 2,
    }).notNull(),
    genderEligibility: genderEligibilityEnum("gender_eligibility")
      .notNull()
      .default("all"),
    targetPersona: targetPersonaEnum("target_persona").notNull().default("any"),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),

    eligibilityRules: jsonb("eligibility_rules")
      .$type<SchemeEligibilityRules>()
      .notNull()
      .default({}),

    isActive: boolean("is_active").notNull().default(true),

    sourceUrl: text("source_url"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("schemes_code_unique").on(table.code)],
);

export const schemeInterestSlabs = pgTable(
  "scheme_interest_slabs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    partnerType: partnerTypeEnum("partner_type").notNull(),
    beneficiaryRatePercent: numeric("beneficiary_rate_percent", {
      precision: 5,
      scale: 2,
    }).notNull(),
    nsfdcRatePercent: numeric("nsfdc_rate_percent", {
      precision: 5,
      scale: 2,
    }),
  },
  (table) => [
    uniqueIndex("scheme_partner_type_unique").on(
      table.schemeId,
      table.partnerType,
    ),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: userRoleEnum("role").notNull().default("citizen"),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  phone: varchar("phone", { length: 15 }).notNull(),
  email: varchar("email", { length: 150 }),
  passwordHash: text("password_hash"), // null for citizens using OTP/WhatsApp-only auth
  managedPartnerId: uuid("managed_partner_id").references(
    () => channelPartners.id,
  ), // set only for branch_admin role
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const schemeRecommendations = pgTable("scheme_recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  inputProfile: jsonb("input_profile").$type<CitizenInputProfile>().notNull(),
  recommendedSchemeId: uuid("recommended_scheme_id")
    .notNull()
    .references(() => schemes.id),
  matchScore: numeric("match_score", { precision: 5, scale: 2 }),
  reasoning: text("reasoning"), // LLM's explanation, shown to the citizen for transparency
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  schemeId: uuid("scheme_id")
    .notNull()
    .references(() => schemes.id),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => channelPartners.id),
  status: applicationStatusEnum("status").notNull().default("recommended"),
  requestedAmount: numeric("requested_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const intakeSessions = pgTable(
  "intake_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    channelId: varchar("channel_id", { length: 50 }).notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    status: intakeSessionStatusEnum("status").notNull().default("in_progress"),
    detectedLanguage: varchar("detected_language", { length: 10 }),

    profile: jsonb("profile")
      .$type<Partial<CitizenInputProfile>>()
      .notNull()
      .default({}),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default([]),

    turnCount: integer("turn_count").notNull().default(0),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Only one *active* session per channel at a time. A completed or
    // abandoned session doesn't block a new conversation from starting
    // on the same channel later — this is a PARTIAL unique index, not
    // a plain one.
    uniqueIndex("intake_sessions_active_channel_unique")
      .on(table.channelId)
      .where(sql`${table.status} = 'in_progress'`),
  ],
);

export const channelPartners = pgTable(
  "channel_partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    partnerType: partnerTypeEnum("partner_type").notNull(),
    status: partnerStatusEnum("status").notNull().default("active"),

    latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
    longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
    address: text("address").notNull(),

    npaRatioPercent: numeric("npa_ratio_percent", { precision: 5, scale: 2 }),
    workingHours: text("working_hours"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("channel_partners_name_unique").on(table.name)],
);

export const partnerSchemeQuotas = pgTable(
  "partner_scheme_quotas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => channelPartners.id, { onDelete: "cascade" }),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    totalQuotaAmount: numeric("total_quota_amount", {
      precision: 14,
      scale: 2,
    }).notNull(),
    utilizedAmount: numeric("utilized_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),

    acceptingApplications: boolean("accepting_applications")
      .notNull()
      .default(true),

    lastReportedAt: timestamp("last_reported_at", { withTimezone: true }),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("partner_scheme_unique").on(table.partnerId, table.schemeId),
  ],
);

export const partnerOutcomeReports = pgTable(
  "partner_outcome_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => channelPartners.id, { onDelete: "cascade" }),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    // Nullable: a citizen may report an outcome before a formal
    // `applications` row exists for the channel they came through.
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    outcome: reportedOutcomeEnum("outcome").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("partner_outcome_reports_partner_scheme_idx").on(
      table.partnerId,
      table.schemeId,
    ),
  ],
);

export const schemesRelations = relations(schemes, ({ many }) => ({
  interestSlabs: many(schemeInterestSlabs),
  partnerQuotas: many(partnerSchemeQuotas),
  applications: many(applications),
}));

export const schemeInterestSlabsRelations = relations(
  schemeInterestSlabs,
  ({ one }) => ({
    scheme: one(schemes, {
      fields: [schemeInterestSlabs.schemeId],
      references: [schemes.id],
    }),
  }),
);

export const channelPartnersRelations = relations(
  channelPartners,
  ({ many }) => ({
    schemeQuotas: many(partnerSchemeQuotas),
    applications: many(applications),
  }),
);
