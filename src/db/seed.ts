import { db } from "./index";
import { schemes } from "./schema";

const main = async () => {
  await db
    .insert(schemes)
    .values([
      {
        code: "MCF",
        name: "Micro Finance Scheme",
        category: "micro_finance",
        description:
          "Loans for small income-generating projects such as livestock rearing, petty trade, or artisan work.",
        minLoanAmount: "0",
        maxLoanAmount: "125000",
        maxProjectCostCoveragePercent: 90,
        interestRateMinPercent: "6.5",
        interestRateMaxPercent: "6.5",
        moratoriumMonthsMin: 3,
        moratoriumMonthsMax: 3,
        repaymentTenureMonths: 36,
        maxAnnualFamilyIncome: "500000",
        genderEligibility: "all",
        targetPersona: "entrepreneur",
        eligibilityRules: { requiresScheduledCaste: true },
        sourceUrl: "https://nsfdc.nic.in/scheme",
        lastVerifiedAt: new Date(),
      },
      {
        code: "TL",
        name: "Term Loan",
        category: "term_loan",
        description:
          "Loans for larger income-generating projects across agriculture, industry, service, and transport sectors.",
        minLoanAmount: "125001",
        maxLoanAmount: "4500000",
        maxProjectCostCoveragePercent: 90,
        interestRateMinPercent: "8",
        interestRateMaxPercent: "8",
        moratoriumMonthsMin: 6,
        moratoriumMonthsMax: 12,
        repaymentTenureMonths: 84,
        maxAnnualFamilyIncome: "500000",
        genderEligibility: "all",
        targetPersona: "entrepreneur",
        eligibilityRules: { requiresScheduledCaste: true },
        sourceUrl: "https://nsfdc.nic.in/scheme",
        lastVerifiedAt: new Date(),
      },
      {
        code: "ELS",
        name: "Educational Loan Scheme",
        category: "education_loan",
        description:
          "Loans for full-time professional/technical courses in India or abroad.",
        minLoanAmount: "0",
        maxLoanAmount: "4000000",
        maxProjectCostCoveragePercent: 90,
        interestRateMinPercent: "6.5",
        interestRateMaxPercent: "6.5",
        moratoriumMonthsMin: 6,
        moratoriumMonthsMax: 12,
        repaymentTenureMonths: 120,
        maxAnnualFamilyIncome: "500000",
        genderEligibility: "all",
        targetPersona: "student",
        eligibilityRules: {
          requiresScheduledCaste: true,
          requiresRecognizedInstitution: true,
        },
        sourceUrl: "https://nsfdc.nic.in/scheme",
        lastVerifiedAt: new Date(),
      },
      {
        code: "AMFY",
        name: "Aajeevika Micro-Finance Yojana",
        category: "micro_finance",
        description:
          "Micro finance for small/micro business activities, routed through NBFC-MFIs.",
        minLoanAmount: "0",
        maxLoanAmount: "125000",
        maxProjectCostCoveragePercent: 90,
        interestRateMinPercent: "15",
        interestRateMaxPercent: "15",
        moratoriumMonthsMin: 3,
        moratoriumMonthsMax: 3,
        repaymentTenureMonths: 36,
        maxAnnualFamilyIncome: "500000",
        genderEligibility: "all",
        targetPersona: "entrepreneur",
        eligibilityRules: {
          requiresScheduledCaste: true,
          disbursedOnlyViaNbfcMfi: true,
        },
        sourceUrl: "https://nsfdc.nic.in/scheme",
        lastVerifiedAt: new Date(),
      },
      {
        code: "UNY",
        name: "Udyam Nidhi Yojana",
        category: "micro_finance",
        description:
          "Loans for small/micro activities up to ₹5 lakh project cost, via Cooperative Banks/Societies and Small Finance Banks.",
        minLoanAmount: "0",
        maxLoanAmount: "450000",
        maxProjectCostCoveragePercent: 90,
        interestRateMinPercent: "13",
        interestRateMaxPercent: "15",
        moratoriumMonthsMin: 3,
        moratoriumMonthsMax: 3,
        repaymentTenureMonths: 60,
        maxAnnualFamilyIncome: "500000",
        genderEligibility: "all",
        targetPersona: "entrepreneur",
        eligibilityRules: { requiresScheduledCaste: true },
        sourceUrl: "https://nsfdc.nic.in/scheme",
        lastVerifiedAt: new Date(),
      },
    ])
    .onConflictDoNothing({ target: schemes.code });

  console.log("Seed completed");
  process.exit(0);
};

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});