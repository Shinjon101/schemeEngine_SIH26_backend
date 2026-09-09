import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { schemes } from "../../db/schema";
import type { CitizenProfile } from "./scheme-matching.schema";

type SchemeCategory = typeof schemes.$inferSelect.category;

const INTENT_TO_CATEGORIES: Record<CitizenProfile["intent"], SchemeCategory[]> =
  {
    business_loan: ["micro_finance", "term_loan", "women_focused"],
    education_loan: ["education_loan"],
    skill_training: ["skill_training"],
  };

export const findCandidateSchemes = async (profile: CitizenProfile) => {
  const conditions = [
    eq(schemes.isActive, true),
    inArray(schemes.category, INTENT_TO_CATEGORIES[profile.intent]),
    gte(schemes.maxAnnualFamilyIncome, profile.annualFamilyIncome.toString()),
    // minAge/maxAge exist on the schemes table specifically to be
    // filtered on here — previously they were populated but never
    // queried, so an age-restricted scheme (e.g. an age-capped
    // skill-training programme) could still be handed to the LLM and
    // potentially recommended to a citizen outside its band. Null
    // bounds mean "no restriction on that side."
    or(isNull(schemes.minAge), lte(schemes.minAge, profile.age)),
    or(isNull(schemes.maxAge), gte(schemes.maxAge, profile.age)),
  ];
  if (profile.gender !== "female") {
    conditions.push(eq(schemes.genderEligibility, "all"));
  }

  return db.query.schemes.findMany({
    where: and(...conditions),
    with: { interestSlabs: true },
  });
};

export type CandidateScheme = Awaited<
  ReturnType<typeof findCandidateSchemes>
>[number];
