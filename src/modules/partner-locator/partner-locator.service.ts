import { haversineKm } from "../../common/geo.util";
import {
  assignSchemeToPartner,
  findEligiblePartners,
  resolveSchemeId,
  upsertPartnerStatusReport,
} from "./partner-locator.repository";
import { scorePartner } from "./partner-locator.scoring";
import type {
  AssignSchemeInput,
  PartnerStatusReport,
} from "./partner-locator.schema";

// Not a cut-off: channel partners are sparse (often one agency per state),
// so partners beyond this are still returned, ranked, and flagged.
const NEARBY_RADIUS_KM = 50;

export interface ScoredPartner {
  partnerId: string;
  partnerName: string;
  partnerType: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  compositeScore: number;
  scoreBreakdown: {
    proximityScore: number;
    /** null when the partner's NPA ratio is unknown. */
    healthScore: number | null;
  };
  /** Whether the fund position was confirmed by the partner or only
   *  entered by an admin — the hook for confirmation-aware ranking. */
  quotaSource: "partner_reported" | "admin_entered";
}

export interface PartnerLocatorResult {
  partners: ScoredPartner[];
  hasEligiblePartners: boolean;
  /** True when no eligible partner is within NEARBY_RADIUS_KM, so the
   *  list holds the nearest options further away. */
  nearestOutsideRadius: boolean;
}

export const locatePartnersForScheme = async (
  schemeReference: string,
  citizenLat: number,
  citizenLng: number,
  limit: number,
): Promise<PartnerLocatorResult> => {
  const schemeId = await resolveSchemeId(schemeReference);
  // Already filtered to partners that can take an application (active,
  // accepting, funds left) — see partner-eligibility.ts.
  const candidates = await findEligiblePartners(schemeId);

  const withDistance = candidates.map((candidate) => ({
    ...candidate,
    distanceKm: haversineKm(
      citizenLat,
      citizenLng,
      Number(candidate.partner.latitude),
      Number(candidate.partner.longitude),
    ),
  }));
  const nearestDistanceKm = Math.min(
    ...withDistance.map((candidate) => candidate.distanceKm),
  );

  const scored: ScoredPartner[] = withDistance.map(({ partner, quota, distanceKm }) => {
    const { signals, compositeScore } = scorePartner({
      npaRatioPercent:
        partner.npaRatioPercent !== null
          ? Number(partner.npaRatioPercent)
          : null,
      distanceKm,
      nearestDistanceKm,
    });

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      partnerType: partner.partnerType,
      address: partner.address,
      latitude: Number(partner.latitude),
      longitude: Number(partner.longitude),
      distanceKm,
      compositeScore,
      scoreBreakdown: {
        proximityScore: signals.proximity as number,
        healthScore: signals.health,
      },
      quotaSource: quota.lastReportedAt ? "partner_reported" : "admin_entered",
    };
  });

  // Ties break on distance, then name, so the same request always yields
  // the same order.
  scored.sort(
    (a, b) =>
      b.compositeScore - a.compositeScore ||
      a.distanceKm - b.distanceKm ||
      a.partnerName.localeCompare(b.partnerName),
  );

  return {
    partners: scored.slice(0, limit),
    hasEligiblePartners: scored.length > 0,
    nearestOutsideRadius:
      scored.length > 0 &&
      !scored.some((partner) => partner.distanceKm <= NEARBY_RADIUS_KM),
  };
};

export const reportPartnerStatus = async (
  partnerId: string,
  schemeId: string,
  data: PartnerStatusReport,
) => {
  await upsertPartnerStatusReport(partnerId, schemeId, data);
  return { updated: true as const };
};

export const assignScheme = async (input: AssignSchemeInput) => {
  await assignSchemeToPartner(
    input.partnerId,
    input.schemeId,
    input.totalQuotaAmount,
  );
  return { assigned: true as const };
};
