import { db } from "./index";
import { channelPartners, schemes, partnerSchemeQuotas } from "./schema";

const main = async () => {
  const allPartners = await db.select().from(channelPartners);
  const allSchemes = await db.select().from(schemes);

  const schemeIdByCode = new Map(allSchemes.map((s) => [s.code, s.id]));
  const partnerIdByName = new Map(allPartners.map((p) => [p.name, p.id]));

  const mcfId = schemeIdByCode.get("MCF");
  const tlId = schemeIdByCode.get("TL");
  const elsId = schemeIdByCode.get("ELS");
  const amfyId = schemeIdByCode.get("AMFY");
  const unyId = schemeIdByCode.get("UNY");

  if (!mcfId || !tlId || !elsId || !amfyId || !unyId) {
    throw new Error(
      "Run seed_scheme.ts first — required schemes are missing."
    );
  }

  const scaPartners = allPartners.filter(
    (p) => p.partnerType === "sca"
  );

  const psbPartners = allPartners.filter(
    (p) => p.partnerType === "psb"
  );

  const nbfcPartners = allPartners.filter(
    (p) => p.partnerType === "nbfc_mfi"
  );

  if (
    scaPartners.length === 0 ||
    psbPartners.length === 0 ||
    nbfcPartners.length === 0
  ) {
    throw new Error(
      "Run seed_partner.ts first — required channel partners are missing."
    );
  }

  const quotaRows: {
    partnerId: string;
    schemeId: string;
    totalQuotaAmount: string;
    utilizedAmount: string;
  }[] = [];

  // ===== Manually set edge cases =====

  const anikId = partnerIdByName.get(
    "Anik Financial Services Private Limited"
  );

  const vectorId = partnerIdByName.get(
    "Vector Finance PVT LTD"
  );

  const biharId = partnerIdByName.get(
    "Bihar State SCs Co-operative Development Corporation Ltd. (BSSCCDC)"
  );

  const goaId = partnerIdByName.get(
    "Goa State SCs & OBCs Finance and Development Corporation Ltd. (GSCOBCDC)"
  );

  // Edge case 1:
  // Fully exhausted quota + partner already suspended for high NPA
  if (anikId) {
    quotaRows.push({
      partnerId: anikId,
      schemeId: amfyId,
      totalQuotaAmount: "8000000",
      utilizedAmount: "8000000",
    });
  }

  // Edge case 2:
  // Utilization exceeds sanctioned quota
  if (vectorId) {
    quotaRows.push({
      partnerId: vectorId,
      schemeId: amfyId,
      totalQuotaAmount: "6000000",
      utilizedAmount: "6450000",
    });
  }

  // Edge case 3:
  // Term Loan quota almost exhausted
  if (biharId) {
    quotaRows.push({
      partnerId: biharId,
      schemeId: tlId,
      totalQuotaAmount: "80000000",
      utilizedAmount: "77600000",
    });
  }

  // Edge case 4:
  // Brand-new quota with zero utilization
  if (goaId) {
    quotaRows.push({
      partnerId: goaId,
      schemeId: mcfId,
      totalQuotaAmount: "12000000",
      utilizedAmount: "0",
    });
  }

  const handled = new Set(
    quotaRows.map((r) => `${r.partnerId}:${r.schemeId}`)
  );

  // ============================================================
  // SCAs → MCF, TL, ELS
  // ============================================================

  scaPartners.forEach((partner, i) => {
    const rows = [
      {
        schemeId: mcfId,
        total: 8000000 + i * 500000,
        pct: 0.3 + (i % 5) * 0.08,
      },
      {
        schemeId: tlId,
        total: 60000000 + i * 4000000,
        pct: 0.25 + (i % 4) * 0.1,
      },
      {
        schemeId: elsId,
        total: 20000000 + i * 1500000,
        pct: 0.2 + (i % 6) * 0.07,
      },
    ];

    for (const r of rows) {
      if (handled.has(`${partner.id}:${r.schemeId}`)) continue;

      quotaRows.push({
        partnerId: partner.id,
        schemeId: r.schemeId,
        totalQuotaAmount: r.total.toFixed(2),
        utilizedAmount: (r.total * r.pct).toFixed(2),
      });
    }
  });

  // ============================================================
  // PSBs → Term Loan only
  // ============================================================

  psbPartners.forEach((partner, i) => {
    if (handled.has(`${partner.id}:${tlId}`)) return;

    const total = 100000000 + i * 8000000;
    const pct = 0.3 + (i % 5) * 0.09;

    quotaRows.push({
      partnerId: partner.id,
      schemeId: tlId,
      totalQuotaAmount: total.toFixed(2),
      utilizedAmount: (total * pct).toFixed(2),
    });
  });

  // ============================================================
  // NBFC-MFIs → AMFY only
  // ============================================================

  nbfcPartners.forEach((partner, i) => {
    if (handled.has(`${partner.id}:${amfyId}`)) return;

    const total = 6000000 + i * 700000;
    const pct = 0.35 + (i % 4) * 0.1;

    quotaRows.push({
      partnerId: partner.id,
      schemeId: amfyId,
      totalQuotaAmount: total.toFixed(2),
      utilizedAmount: (total * pct).toFixed(2),
    });
  });

  // ============================================================
  // UNY → TEST DATA
  // ============================================================
  //
  // IMPORTANT:
  // UNY should officially be routed through Cooperative Banks
  // and Small Finance Banks.
  //
  // Current seed data does not contain those partner types.
  // Therefore, these rows use existing partners ONLY as
  // temporary mock data for testing the routing engine.
  //
  // Replace these with actual cooperative_bank /
  // small_finance_bank partners when those are seeded.
  // ============================================================

  const unyTestPartners = [
    "State Bank of India",
    "Punjab National Bank",
    "Bank of Baroda",
    "HDFC Bank",
  ];

  const unyTestData = [
    {
      total: "25000000",
      utilized: "5000000", // 20%
    },
    {
      total: "30000000",
      utilized: "22500000", // 75%
    },
    {
      total: "20000000",
      utilized: "19000000", // 95%
    },
    {
      total: "15000000",
      utilized: "15000000", // 100%
    },
  ];

  unyTestPartners.forEach((partnerName, i) => {
    const partnerId = partnerIdByName.get(partnerName);

    if (!partnerId) return;

    if (handled.has(`${partnerId}:${unyId}`)) return;

    const data = unyTestData[i];

    quotaRows.push({
      partnerId,
      schemeId: unyId,
      totalQuotaAmount: data.total,
      utilizedAmount: data.utilized,
    });
  });

  // ============================================================
  // INSERT
  // ============================================================

  await db
    .insert(partnerSchemeQuotas)
    .values(quotaRows)
    .onConflictDoNothing({
      target: [
        partnerSchemeQuotas.partnerId,
        partnerSchemeQuotas.schemeId,
      ],
    });

  console.log(
    `Partner-scheme quotas seed completed — ${quotaRows.length} rows attempted`
  );

  process.exit(0);
};

main().catch((error) => {
  console.error(
    "Partner-scheme quotas seed failed:",
    error
  );

  process.exit(1);
});