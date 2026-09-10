import type { partnerTypeEnum, schemeCategoryEnum } from "../../db/schema";

type PartnerType = (typeof partnerTypeEnum.enumValues)[number];
type SchemeCategory = (typeof schemeCategoryEnum.enumValues)[number];

// Source: NSFDC channel-authorization rules (MFS/Term Loan/ELS via
// SCAs/PSBs/RRBs; AMY via selected NBFC-MFIs; UNY via Cooperative
// Banks/Societies + SFBs). Kept as a plain data map — not a DB constraint —
// specifically so adding a new scheme category or partner-type mapping
// later (e.g. once AMY/UNY are seeded as real scheme rows) is a one-line
// edit here, not a migration. Any automated scheme-ingestion process
// should call `isPartnerTypeAuthorizedForScheme` rather than re-deriving
// this rule itself.
const AUTHORIZED_PARTNER_TYPES: Record<SchemeCategory, PartnerType[]> = {
  micro_finance: ["sca", "psb", "rrb"],
  term_loan: ["sca", "psb", "rrb"],
  education_loan: ["sca", "psb", "rrb"],
  skill_training: ["sca", "psb", "rrb"],
  women_focused: ["sca", "psb", "rrb"],
};

// Partner types whose real NSFDC products (AMY, UNY) aren't represented
// in scheme_category yet. Explicitly unmapped rather than silently
// defaulting to "authorized" or "unauthorized" — surfaces as a clear
// false from the guard below until those schemes are seeded.
const UNMAPPED_PARTNER_TYPES: PartnerType[] = [
  "nbfc_mfi",
  "cooperative_bank",
  "small_finance_bank",
];

export const isPartnerTypeAuthorizedForScheme = (
  partnerType: PartnerType,
  schemeCategory: SchemeCategory,
): boolean => {
  if (UNMAPPED_PARTNER_TYPES.includes(partnerType)) return false;
  return (
    AUTHORIZED_PARTNER_TYPES[schemeCategory]?.includes(partnerType) ?? false
  );
};
