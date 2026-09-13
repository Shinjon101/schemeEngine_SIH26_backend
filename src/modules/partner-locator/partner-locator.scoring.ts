/**
 * Ranks partners that already passed the routing gate (see
 * partner-eligibility.ts). Nothing here decides eligibility — only order.
 *
 * Each signal is normalised to 0-1, or null when it is unknown for this
 * partner. The composite is a weighted mean over the known signals only,
 * so a partner is never penalised for missing data. Adding a signal later
 * (citizen outcome reports, fund-report freshness) is: compute it, add its
 * weight below.
 */

export type PartnerSignal = "proximity" | "health";

// Distance leads: for the citizen, travel cost outweighs a small NPA
// difference, and partners with serious NPA problems are already
// suspended and never reach this scorer.
// Future signals: outcomes (partner_outcome_reports), freshness (lastReportedAt).
const WEIGHTS: Record<PartnerSignal, number> = {
  proximity: 0.6,
  health: 0.4,
};

// Proximity is relative to the nearest eligible partner, so it stays
// meaningful when every option is hundreds of km away: the nearest scores
// 1, and the score falls as a partner gets further than that. The offset
// keeps small absolute gaps (2 km vs 6 km) from looking like 3x.
const PROXIMITY_OFFSET_KM = 50;
// NPA ratio at which health reaches 0.
const NPA_FLOOR_PERCENT = 15;

export type PartnerSignals = Record<PartnerSignal, number | null>;

export interface ScorePartnerInput {
  npaRatioPercent: number | null;
  distanceKm: number;
  /** Distance to the nearest partner in the same candidate set. */
  nearestDistanceKm: number;
}

export interface PartnerScore {
  signals: PartnerSignals;
  compositeScore: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export const compositeOf = (signals: PartnerSignals): number => {
  let weighted = 0;
  let totalWeight = 0;
  for (const [signal, value] of Object.entries(signals) as [
    PartnerSignal,
    number | null,
  ][]) {
    if (value === null) continue;
    weighted += WEIGHTS[signal] * value;
    totalWeight += WEIGHTS[signal];
  }
  return totalWeight > 0 ? round4(weighted / totalWeight) : 0;
};

export const scorePartner = ({
  npaRatioPercent,
  distanceKm,
  nearestDistanceKm,
}: ScorePartnerInput): PartnerScore => {
  const signals: PartnerSignals = {
    proximity: round4(
      clamp01(
        (nearestDistanceKm + PROXIMITY_OFFSET_KM) /
          (distanceKm + PROXIMITY_OFFSET_KM),
      ),
    ),
    health:
      npaRatioPercent === null
        ? null
        : round4(clamp01(1 - npaRatioPercent / NPA_FLOOR_PERCENT)),
  };

  return { signals, compositeScore: compositeOf(signals) };
};
