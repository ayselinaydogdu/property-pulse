/**
 * Semt göstergelerini üretir.
 *
 * Temel kural: bilinmeyen sayı üretilmez. Verisi olmayan her şey `null` döner ve
 * arayüzde "veri yok" olarak görünür - tahmin edilmez, sıfır sayılmaz.
 */
import type { PriceMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { iqrFilter, median, round } from "@/lib/stats";

/** Kendi gözlemlerimizden ortalama hesaplamak için gereken en az kayıt sayısı. */
const MIN_OWN_OBSERVATIONS = 20;

export type Provenance = {
  source: string;
  sourceUrl: string | null;
  method: PriceMethod;
  /** ISO tarih */
  observedAt: string;
  sampleSize: number | null;
  note: string | null;
};

export type RentEstimate = {
  /** Tek kaynak varsa min = max. Kaynaklar çelişirse aralık gösterilir. */
  perM2Min: number;
  perM2Max: number;
  /** Hesaplarda kullanılan orta değer */
  perM2: number;
  /** Kaynaklar çelişiyor mu - arayüz buna göre aralık gösterir */
  hasSpread: boolean;
  /** Kendi gözlemimiz mi, yayınlanmış çapa mı */
  basis: "OWN_OBSERVATIONS" | "BENCHMARK";
  /** Kendi veritabanımızdaki tek tek kayıt sayısı */
  observationCount: number;
  sources: Provenance[];
};

export type BasketLine = {
  slug: string;
  name: string;
  category: string;
  unit: string;
  monthlyQty: number;
  scope: "CITY" | "DISTRICT";
  unitPrice: number;
  monthlyCost: number;
  provenance: Provenance;
};

export type CostEstimate = {
  monthly: number;
  lines: BasketLine[];
};

export type NeighborhoodStats = {
  slug: string;
  name: string;
  district: string;
  city: string;
  lat: number;
  lng: number;
  /** GeoJSON Polygon halkaları ([lng, lat]); sınır verisi yoksa null */
  polygon: number[][][] | null;
  /** Kira verisi yoksa null */
  rent: RentEstimate | null;
  /** Yaşam maliyeti verisi yoksa null - sıfır DEĞİL */
  cost: CostEstimate | null;
  /** Hangi verilerin eksik olduğu, arayüzde dürüstçe gösterilmek üzere */
  missing: string[];
};

function toProvenance(row: {
  source: string;
  sourceUrl: string | null;
  method: PriceMethod;
  observedAt: Date;
  sampleSize?: number | null;
  note?: string | null;
}): Provenance {
  return {
    source: row.source,
    sourceUrl: row.sourceUrl,
    method: row.method,
    observedAt: row.observedAt.toISOString(),
    sampleSize: row.sampleSize ?? null,
    note: row.note ?? null,
  };
}

export async function getNeighborhoodStats(): Promise<NeighborhoodStats[]> {
  const neighborhoods = await prisma.neighborhood.findMany({
    orderBy: { name: "asc" },
    include: {
      listings: { where: { type: "RENT" } },
      benchmarks: { orderBy: { retrievedAt: "desc" } },
      priceEntries: { include: { item: true } },
    },
  });

  // scope = CITY olan kalemler tüm ilçeler için ortak
  const cityEntries = await prisma.priceEntry.findMany({
    where: { neighborhoodId: null },
    include: { item: true },
  });

  return neighborhoods.map((n) => {
    const missing: string[] = [];

    // --- Kira ---
    let rent: RentEstimate | null = null;

    if (n.listings.length >= MIN_OWN_OBSERVATIONS) {
      // Yeterli kendi gözlemimiz var: medyan + aykırı değer filtresi
      const used = iqrFilter(n.listings, (l) => l.price / l.areaM2);
      const perM2 = round(median(used.map((l) => l.price / l.areaM2)), 1);
      rent = {
        perM2Min: perM2,
        perM2Max: perM2,
        perM2,
        hasSpread: false,
        basis: "OWN_OBSERVATIONS",
        observationCount: used.length,
        sources: [
          {
            source: "Kullanıcı katkısı",
            sourceUrl: null,
            method: "OBSERVED",
            observedAt: new Date(
              Math.max(...used.map((l) => l.observedAt.getTime())),
            ).toISOString(),
            sampleSize: used.length,
            note: `${used.length} kayıt (aykırı değerler elendi)`,
          },
        ],
      };
    } else if (n.benchmarks.length > 0) {
      // Her kaynağın en güncel satırı - aynı kaynağın eski ölçümü tekrar sayılmasın
      const latestPerSource = new Map<string, (typeof n.benchmarks)[number]>();
      for (const b of n.benchmarks) {
        if (!latestPerSource.has(b.source)) latestPerSource.set(b.source, b);
      }
      const rows = [...latestPerSource.values()];
      const values = rows.map((b) => b.rentPerM2);
      const perM2Min = Math.min(...values);
      const perM2Max = Math.max(...values);

      rent = {
        perM2Min,
        perM2Max,
        // Kaynaklar çelişiyorsa medyan alınır; tek kaynakta zaten o değer
        perM2: round(median(values), 1),
        hasSpread: perM2Min !== perM2Max,
        basis: "BENCHMARK",
        observationCount: n.listings.length,
        sources: rows.map((b) =>
          toProvenance({
            source: b.source,
            sourceUrl: b.sourceUrl,
            method: b.method,
            observedAt: b.retrievedAt,
            sampleSize: b.sampleSize,
            note: b.note,
          }),
        ),
      };
    } else {
      missing.push("kira");
    }

    // --- Yaşam maliyeti ---
    const entries = [...n.priceEntries, ...cityEntries];
    let cost: CostEstimate | null = null;

    if (entries.length > 0) {
      const lines: BasketLine[] = entries
        .map((entry) => {
          const unitPrice = entry.priceKurus / 100;
          return {
            slug: entry.item.slug,
            name: entry.item.name,
            category: entry.item.category,
            unit: entry.item.unit,
            monthlyQty: entry.item.monthlyQty,
            scope: entry.item.scope as "CITY" | "DISTRICT",
            unitPrice,
            monthlyCost: round(unitPrice * entry.item.monthlyQty, 2),
            provenance: toProvenance({
              source: entry.source,
              sourceUrl: entry.sourceUrl,
              method: entry.method,
              observedAt: entry.observedAt,
            }),
          };
        })
        .sort((a, b) => b.monthlyCost - a.monthlyCost);

      cost = {
        monthly: round(lines.reduce((sum, l) => sum + l.monthlyCost, 0), 2),
        lines,
      };
    } else {
      missing.push("yaşam maliyeti");
    }

    return {
      slug: n.slug,
      name: n.name,
      district: n.district,
      city: n.city,
      lat: n.lat,
      lng: n.lng,
      polygon: (n.polygon as number[][][] | null) ?? null,
      rent,
      cost,
      missing,
    };
  });
}

export type AffordabilityRow = NeighborhoodStats & {
  areaM2: number;
  /** Kira verisi yoksa null */
  estimatedRent: number | null;
  estimatedRentMin: number | null;
  estimatedRentMax: number | null;
  /** Yaşam maliyeti verisi yoksa null */
  estimatedCost: number | null;
  /** SADECE bilinen kalemlerin toplamı - eksik kalem varsa gerçek toplam bundan yüksek */
  knownMonthly: number | null;
  leftover: number | null;
  /** Bilinen kalemlerin gelire oranı, % */
  knownBurdenPct: number | null;
  /** Eksik veri varsa null: bilmediğimiz için "uygun" diyemeyiz */
  affordable: boolean | null;
};

export type AffordabilityInput = {
  income: number;
  /** Aranan daire büyüklüğü, m². Kaynaktan gelmeyen bir seçim olduğu için zorunlu. */
  areaM2: number;
  household?: number;
  maxBurdenPct?: number;
};

export function applyAffordability(
  stats: NeighborhoodStats[],
  input: AffordabilityInput,
): AffordabilityRow[] {
  const { income, areaM2, household = 1, maxBurdenPct = 60 } = input;
  // İkinci kişi tek kişinin tam katı kadar harcamaz (ortak giderler paylaşılır)
  const householdFactor = 1 + (household - 1) * 0.75;

  return stats
    .map((n) => {
      const estimatedRent = n.rent ? round(n.rent.perM2 * areaM2) : null;
      const estimatedRentMin = n.rent ? round(n.rent.perM2Min * areaM2) : null;
      const estimatedRentMax = n.rent ? round(n.rent.perM2Max * areaM2) : null;
      const estimatedCost = n.cost ? round(n.cost.monthly * householdFactor) : null;

      const known =
        estimatedRent === null && estimatedCost === null
          ? null
          : (estimatedRent ?? 0) + (estimatedCost ?? 0);

      const knownBurdenPct =
        known !== null && income > 0 ? round((known * 100) / income, 1) : null;

      return {
        ...n,
        areaM2,
        estimatedRent,
        estimatedRentMin,
        estimatedRentMax,
        estimatedCost,
        knownMonthly: known,
        leftover: known !== null ? round(income - known) : null,
        knownBurdenPct,
        // Eksik kalem varken "bütçene uygun" demek yanıltıcı olur
        affordable:
          n.missing.length > 0 || knownBurdenPct === null
            ? null
            : knownBurdenPct <= maxBurdenPct,
      };
    })
    .sort((a, b) => {
      if (a.leftover === null) return 1;
      if (b.leftover === null) return -1;
      return b.leftover - a.leftover;
    });
}
