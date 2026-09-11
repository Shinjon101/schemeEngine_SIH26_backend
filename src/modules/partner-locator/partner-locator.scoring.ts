import type { ConfidenceStats } from "../partner-feedback/partner-feedback.repository";

export interface ScoreBreakdown {
  quotaScore: number;
  healthScore: number;
  proximityScore: number;
  confidenceScore: number;
  compositeScore: number;
}

const WEIGHTS = {
  quota: 0.35,
  health: 0.2,
  proximity: 0.2,
  confidence: 0.25,
} as const;

const MAX_CONSIDERED_RADIUS_KM = 50;
const NPA_FLOOR_PERCENT = 15;

export interface ScorePartnerInput {
  totalQuota: number;
  utilizedQuota: number;
  npaRatioPercent: number | null;
  distanceKm: number;
  confidenceStats: ConfidenceStats | undefined;
}

export const scorePartner = ({
  totalQuota,
  utilizedQuota,
  npaRatioPercent,
  distanceKm,
  confidenceStats,
}: ScorePartnerInput): ScoreBreakdown => {
  const quotaScore =
    totalQuota > 0
      ? Math.max(0, Math.min(1, (totalQuota - utilizedQuota) / totalQuota))
      : 0;

  const healthScore =
    npaRatioPercent === null
      ? 0.5
      : Math.max(0, 1 - npaRatioPercent / NPA_FLOOR_PERCENT);

  const proximityScore = Math.max(0, 1 - distanceKm / MAX_CONSIDERED_RADIUS_KM);

  const successCount = confidenceStats?.successCount ?? 0;
  const totalDecisive = confidenceStats?.totalDecisive ?? 0;
  const confidenceScore = (successCount + 1) / (totalDecisive + 2);

  const compositeScore =
    WEIGHTS.quota * quotaScore +
    WEIGHTS.health * healthScore +
    WEIGHTS.proximity * proximityScore +
    WEIGHTS.confidence * confidenceScore;

  return {
    quotaScore,
    healthScore,
    proximityScore,
    confidenceScore,
    compositeScore,
  };
};
