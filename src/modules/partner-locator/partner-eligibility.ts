import { and, eq, sql } from "drizzle-orm";
import { channelPartners, partnerSchemeQuotas } from "../../db/schema";

/**
 * The single routing gate: can this partner take a new application for
 * this scheme right now? Used by every query that lists or counts partners
 * for citizens (the partner locator and the scheme matcher's location
 * signal), so the two can never disagree about who is available.
 *
 * Expects `channel_partners` joined to `partner_scheme_quotas`.
 *
 *  - status = active: suspended partners (e.g. `suspended_high_npa`, set by
 *    NSFDC) are never routed to. This is also the NPA hard gate.
 *  - acceptingApplications: the per-scheme on/off switch a branch admin
 *    controls.
 *  - funds left: utilised < total. A future minimum-remaining check for the
 *    citizen's loan amount belongs here too.
 */
export const canTakeApplications = and(
  eq(channelPartners.status, "active"),
  eq(partnerSchemeQuotas.acceptingApplications, true),
  sql`${partnerSchemeQuotas.utilizedAmount} < ${partnerSchemeQuotas.totalQuotaAmount}`,
);
