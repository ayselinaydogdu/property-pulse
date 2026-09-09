import { NextResponse } from "next/server";
import { applyAffordability, getNeighborhoodStats } from "@/lib/aggregate";

/** Kaynaktan gelmeyen, kullanıcının seçmesi gereken varsayılan daire büyüklüğü. */
const DEFAULT_AREA_M2 = 90;

/**
 * GET /api/affordability?income=75000&areaM2=90&household=1&maxBurdenPct=60
 *
 * Verisi eksik olan semtler için `affordable: null` döner - "uygun değil" değil,
 * "bilmiyoruz". Toplamlar sadece kaynağı olan kalemleri içerir.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const income = Number(params.get("income"));
  if (!Number.isFinite(income) || income <= 0) {
    return NextResponse.json(
      { error: "`income` zorunlu ve pozitif bir sayı olmalı (aylık net gelir, TL)" },
      { status: 400 },
    );
  }

  const areaM2 = params.has("areaM2") ? Number(params.get("areaM2")) : DEFAULT_AREA_M2;
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    return NextResponse.json({ error: "`areaM2` pozitif bir sayı olmalı" }, { status: 400 });
  }

  const household = params.has("household") ? Number(params.get("household")) : 1;
  if (!Number.isFinite(household) || household < 1) {
    return NextResponse.json({ error: "`household` en az 1 olmalı" }, { status: 400 });
  }

  const maxBurdenPct = params.has("maxBurdenPct") ? Number(params.get("maxBurdenPct")) : 60;
  if (!Number.isFinite(maxBurdenPct) || maxBurdenPct <= 0) {
    return NextResponse.json({ error: "`maxBurdenPct` pozitif olmalı" }, { status: 400 });
  }

  const stats = await getNeighborhoodStats();
  const rows = applyAffordability(stats, { income, areaM2, household, maxBurdenPct });

  return NextResponse.json({
    input: {
      income,
      areaM2,
      areaM2IsDefault: !params.has("areaM2"),
      household,
      maxBurdenPct,
    },
    // Eksik veri yüzünden hakkında hüküm verilemeyen semtler
    unknownCount: rows.filter((r) => r.affordable === null).length,
    affordableCount: rows.filter((r) => r.affordable === true).length,
    neighborhoods: rows,
  });
}
