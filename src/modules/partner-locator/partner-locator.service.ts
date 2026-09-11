import { haversineKm } from "../../common/geo.util";
import { getConfidenceStatsBatch } from "../partner-feedback/partner-feedback.repository";
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
    quotaScore: number;
    healthScore: number;
    proximityScore: number;
    confidenceScore: number;
  };
  quotaSource: "partner_reported" | "admin_entered";
}

export const locatePartnersForScheme = async (
  schemeReference: string,
  citizenLat: number,
  citizenLng: number,
  limit: number,
): Promise<{ partners: ScoredPartner[]; hasEligiblePartners: boolean }> => {
  const schemeId = await resolveSchemeId(schemeReference);
  const candidates = await findEligiblePartners(schemeId);

  if (candidates.length === 0) {
    return { partners: [], hasEligiblePartners: false };
  }

  const partnerIds = candidates.map((c) => c.partner.id);
  const confidenceByPartner = await getConfidenceStatsBatch(
    partnerIds,
    schemeId,
  );

  const scored: ScoredPartner[] = candidates
    .map(({ partner, quota }) => {
      const distanceKm = haversineKm(
        citizenLat,
        citizenLng,
        Number(partner.latitude),
        Number(partner.longitude),
      );

      const breakdown = scorePartner({
        totalQuota: Number(quota.totalQuotaAmount),
        utilizedQuota: Number(quota.utilizedAmount),
        npaRatioPercent: partner.npaRatioPercent
          ? Number(partner.npaRatioPercent)
          : null,
        distanceKm,
        confidenceStats: confidenceByPartner.get(partner.id),
      });

      return {
        partnerId: partner.id,
        partnerName: partner.name,
        partnerType: partner.partnerType,
        address: partner.address,
        latitude: Number(partner.latitude),
        longitude: Number(partner.longitude),
        distanceKm,
        compositeScore: breakdown.compositeScore,
        scoreBreakdown: {
          quotaScore: breakdown.quotaScore,
          healthScore: breakdown.healthScore,
          proximityScore: breakdown.proximityScore,
          confidenceScore: breakdown.confidenceScore,
        },
        quotaSource: (quota.lastReportedAt
          ? "partner_reported"
          : "admin_entered") as "partner_reported" | "admin_entered",
      };
    })
    .filter((partner) => partner.distanceKm <= NEARBY_RADIUS_KM);

  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  return {
    partners: scored.slice(0, limit),
    hasEligiblePartners: scored.length > 0,
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
