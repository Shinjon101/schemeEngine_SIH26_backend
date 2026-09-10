import { and, eq } from "drizzle-orm";
import { HttpError } from "../../common/http-error";
import { db } from "../../db";
import { channelPartners, partnerSchemeQuotas, schemes } from "../../db/schema";
import { isPartnerTypeAuthorizedForScheme } from "./scheme-authorization";

export const findEligiblePartners = async (schemeId: string) => {
  return db
    .select({ partner: channelPartners, quota: partnerSchemeQuotas })
    .from(partnerSchemeQuotas)
    .innerJoin(
      channelPartners,
      eq(channelPartners.id, partnerSchemeQuotas.partnerId),
    )
    .where(
      and(
        eq(partnerSchemeQuotas.schemeId, schemeId),
        eq(channelPartners.status, "active"),
        eq(partnerSchemeQuotas.acceptingApplications, true),
      ),
    );
};

export type EligiblePartnerRow = Awaited<
  ReturnType<typeof findEligiblePartners>
>[number];

export const upsertPartnerStatusReport = async (
  partnerId: string,
  schemeId: string,
  data: { acceptingApplications: boolean; utilizedAmount?: number },
) => {
  const result = await db
    .update(partnerSchemeQuotas)
    .set({
      acceptingApplications: data.acceptingApplications,
      ...(data.utilizedAmount !== undefined && {
        utilizedAmount: data.utilizedAmount.toString(),
      }),
      lastReportedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(partnerSchemeQuotas.partnerId, partnerId),
        eq(partnerSchemeQuotas.schemeId, schemeId),
      ),
    )
    .returning({ id: partnerSchemeQuotas.id });

  if (result.length === 0) {
    throw HttpError.notFound(
      "This partner is not authorized for the given scheme",
    );
  }
};

export const assignSchemeToPartner = async (
  partnerId: string,
  schemeId: string,
  totalQuotaAmount: number,
) => {
  const [partner, scheme] = await Promise.all([
    db.query.channelPartners.findFirst({
      where: eq(channelPartners.id, partnerId),
    }),
    db.query.schemes.findFirst({ where: eq(schemes.id, schemeId) }),
  ]);

  if (!partner) throw HttpError.notFound("Channel partner not found");
  if (!scheme) throw HttpError.notFound("Scheme not found");

  if (!isPartnerTypeAuthorizedForScheme(partner.partnerType, scheme.category)) {
    throw HttpError.badRequest(
      `${partner.partnerType} is not an authorized channel type for ${scheme.category} schemes`,
      { partnerType: partner.partnerType, schemeCategory: scheme.category },
    );
  }

  await db.insert(partnerSchemeQuotas).values({
    partnerId,
    schemeId,
    totalQuotaAmount: totalQuotaAmount.toString(),
  });
};
