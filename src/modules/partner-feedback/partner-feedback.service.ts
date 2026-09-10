import { recordOutcomeReport } from "./partner-feedback.repository";
import type { ReportOutcomeInput } from "./partner-feedback.schema";

export const submitOutcomeReport = async (input: ReportOutcomeInput) => {
  await recordOutcomeReport(input);
  return { recorded: true as const };
};
