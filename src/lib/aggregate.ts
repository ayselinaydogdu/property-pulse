/**
 * Semt göstergelerini üretir.
 *
 * Temel kural: bilinmeyen sayı üretilmez. Verisi olmayan her şey `null` döner ve
 * arayüzde "veri yok" olarak görünür - tahmin edilmez, sıfır sayılmaz.
 */
import type { SourceMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { haversineKm } from "@/lib/geo";
import { iqrFilter, median, round } from "@/lib/stats";

/** Kendi gözlemlerimizden ortalama hesaplamak için gereken en az kayıt sayısı. */
const MIN_OWN_OBSERVATIONS = 20;

export type Provenance = {
  source: string;
  sourceUrl: string | null;
  method: SourceMethod;
  /** ISO tarih */
  observedAt: string;
  sampleSize: number | null;
  note: string | null;
};

export type IndexPoint = { period: string; periodStart: Date; value: number };

/**
 * Bayat bir çapanın hangi katsayıyla güncelleneceğini hesaplar.
 *
 * Çapa tarihini kapsayan (ya da ondan önceki en yakın) çeyrek taban alınır;
 * serinin son çeyreğine oranlanır. Çapa serinin son gözleminden yeniyse
 * güncellemeye gerek yoktur ve `null` döner - uydurma bir tazelik üretilmez.
 */
export function computeIndexFactor(
  anchorDate: Date,
  points: IndexPoint[],
): { factor: number; baseline: IndexPoint; latest: IndexPoint } | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const baseline = points.filter((p) => p.periodStart <= anchorDate).at(-1);
  if (!baseline || latest.periodStart <= baseline.periodStart) return null;
  return { factor: latest.value / baseline.value, baseline, latest };
}

export type RentSourceValue = { perM2: number; provenance: Provenance };

/**
 * Aynı ilçe için birden fazla kaynağı birleştirir.
 *
 * Kaynaklar çelişince tek bir sayı seçmek sahte kesinlik olur: hesapta
 * medyan kullanılır ama arayüz alt-üst sınırı da gösterir. Bu yüzden
 * `hasSpread`, kaynakların gerçekten ayrıştığını söyler.
 */
export function combineRentSources(values: RentSourceValue[]): {
  perM2: number;
  perM2Min: number;
  perM2Max: number;
  hasSpread: boolean;
  sources: Provenance[];
} | null {
  if (values.length === 0) return null;
  const numbers = values.map((v) => v.perM2);
  const perM2Min = Math.min(...numbers);
  const perM2Max = Math.max(...numbers);
  return {
    perM2: round(median(numbers), 1),
    perM2Min: round(perM2Min, 1),
    perM2Max: round(perM2Max, 1),
    hasSpread: perM2Min !== perM2Max,
    sources: values.map((v) => v.provenance),
  };
}

export type RentIndexInfo = {
  /** TCMB'ye göre İstanbul geneli birim kira, TL/m² */
  cityPerM2: number;
  /** "2026-Q2" */
  period: string;
  /**
   * Çapa bayatladığı için uygulanan katsayı. null = çapa endeksin son
   * gözleminden daha yeni, güncellemeye gerek yok.
   */
  appliedFactor: number | null;
  baselinePeriod: string | null;
  provenance: Provenance;
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
  /** TCMB şehir geneli referansı ve varsa uygulanan endeksleme */
  index: RentIndexInfo | null;
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

/**
 * Uzun hat adından kısa kodu çıkarır:
 * "M4 Kadıköy - SGH Metro Hattı" -> "M4"
 * "Halkalı - Gebze Marmaray..."  -> "Marmaray"
 * Kodu olmayan hatlarda tür adına düşülür - tahmin edilmez.
 */
function lineCode(line: string, mode: string): string {
  const code = line.match(/^(M\d+[A-Z]?|T\d+|TF\d+|F\d+)\b/)?.[1];
  if (code) return code;
  if (/marmaray/i.test(line)) return "Marmaray";
  if (mode === "Metrobüs") return "Metrobüs";
  return mode;
}

export type DistrictStation = {
  name: string;
  /** Kısa hat kodu: M4, T1, Marmaray, Metrobüs */
  line: string;
  /** Kaynaktaki tam hat adı */
  lineName: string;
  mode: string;
  /** Hattın İstanbul genelindeki toplam mevcut istasyon sayısı */
  lineTotal: number;
  /** İlçe merkezinden kuş uçuşu km */
  km: number;
};

export type TransitAccess = {
  /** Bugün hizmet veren istasyon sayısı */
  existingStations: number;
  /** İnşaat halindeki istasyonlar - bugün erişim sağlamaz, ayrı sayılır */
  underConstruction: number;
  /**
   * İlçe merkezinden en yakın mevcut istasyona KUŞ UÇUŞU mesafe.
   * Yürüme mesafesi değildir; evden istasyona gerçek mesafe bundan uzundur.
   */
  nearestStationKm: number | null;
  nearestStationName: string | null;
  /** En yakın istasyonun hattı (kısa kod) */
  nearestStationLine: string | null;
  /** İlçedeki mevcut istasyonların türleri: Metro, Tramvay, Banliyö, Metrobüs... */
  modes: string[];
  /** İlçeye hizmet eden hatların kısa kodları: M4, T1, Marmaray, Metrobüs... */
  lines: string[];
  /** İlçedeki mevcut istasyonlar, merkeze yakından uzağa */
  stations: DistrictStation[];
  provenance: Provenance;
};

export type BusAccess = {
  stops: number;
  lines: number;
  weekdayDepartures: number;
  /** Ortalama bir durağa hafta içi günde yapılan sefer - ilçe büyüklüğünden bağımsız */
  departuresPerStop: number;
  /** 39 ilçe içindeki sırası (1 = en sık) */
  rank: number;
  provenance: Provenance;
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
  /** Raylı sistem + metrobüs erişimi; istasyon verisi yoksa null */
  transit: TransitAccess | null;
  /** Otobüs hizmet yoğunluğu; veri yoksa null */
  bus: BusAccess | null;
  /** Hangi verilerin eksik olduğu, arayüzde dürüstçe gösterilmek üzere */
  missing: string[];
};

function toProvenance(row: {
  source: string;
  sourceUrl: string | null;
  method: SourceMethod;
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
      stations: true,
      busService: true,
      priceEntries: { include: { item: true } },
    },
  });

  // scope = CITY olan kalemler tüm ilçeler için ortak
  const cityEntries = await prisma.priceEntry.findMany({
    where: { neighborhoodId: null },
    include: { item: true },
  });

  // "En yakın istasyon" ilçe sınırını aşabilir, o yüzden hepsi lazım
  const allExisting = await prisma.transitStation.findMany({ where: { stage: "EXISTING" } });

  // TCMB kira endeksi: bayat çapaları güncellemek ve şehir geneli referans için
  const indexPoints = await prisma.rentIndexPoint.findMany({
    where: { series: "TP.BK.ISTANBUL" },
    orderBy: { periodStart: "asc" },
  });
  const latestIndex = indexPoints.at(-1) ?? null;

  // Sıklık sıralaması: kullanıcı "bu ilçe sık mı seyrek mi" diye bakacak
  const busRanking = neighborhoods
    .filter((n) => n.busService)
    .sort((a, b) => b.busService!.departuresPerStop - a.busService!.departuresPerStop)
    .map((n) => n.slug);

  // Bir hattın kaç istasyonu var - panelde "bu ilçede 2, hattın toplam 19" demek için
  const lineTotals = new Map<string, number>();
  for (const st of allExisting) {
    const code = lineCode(st.line, st.mode);
    lineTotals.set(code, (lineTotals.get(code) ?? 0) + 1);
  }

  return neighborhoods.map((n) => {
    const missing: string[] = [];

    // --- Kira ---
    // İki olası kaynak var: yayınlanmış ilçe ortalaması ve yeterince katkı
    // birikmişse kendi kayıtlarımız. İkisi de varsa ikisi de gösterilir -
    // birini seçip diğerini gizlemek, kaynakların ayrıştığı bilgisini yok eder.
    const rentValues: RentSourceValue[] = [];

    if (n.listings.length >= MIN_OWN_OBSERVATIONS) {
      const used = iqrFilter(n.listings, (l) => l.price / l.areaM2);
      rentValues.push({
        perM2: round(median(used.map((l) => l.price / l.areaM2)), 1),
        provenance: {
          source: "Kullanıcı katkısı",
          sourceUrl: null,
          method: "OBSERVED",
          observedAt: new Date(
            Math.max(...used.map((l) => l.observedAt.getTime())),
          ).toISOString(),
          sampleSize: used.length,
          note: `${used.length} kayıt, aykırı değerler elendi`,
        },
      });
    }

    // Her kaynağın en güncel satırı - aynı kaynağın eski ölçümü tekrar sayılmasın
    const latestPerSource = new Map<string, (typeof n.benchmarks)[number]>();
    for (const b of n.benchmarks) {
      if (!latestPerSource.has(b.source)) latestPerSource.set(b.source, b);
    }
    const benchmarkRows = [...latestPerSource.values()];

    // Çapa bayatladıysa TCMB serisiyle oranlanır. Ölçüm değil çıkarımdır.
    const indexing = benchmarkRows.length
      ? computeIndexFactor(benchmarkRows[0].retrievedAt, indexPoints)
      : null;
    const factor = indexing?.factor ?? null;

    for (const b of benchmarkRows) {
      rentValues.push({
        perM2: round(b.rentPerM2 * (factor ?? 1), 1),
        provenance: toProvenance({
          source: b.source,
          sourceUrl: b.sourceUrl,
          method: factor === null ? b.method : "DERIVED",
          observedAt: b.retrievedAt,
          sampleSize: b.sampleSize,
          note:
            factor === null
              ? b.note
              : `${b.note ?? ""} Çapa ${indexing?.baseline.period} tarihliydi; ${indexing?.latest.period} verisiyle ×${round(factor, 3)} güncellendi.`.trim(),
        }),
      });
    }

    const combined = combineRentSources(rentValues);
    let rent: RentEstimate | null = null;

    if (combined) {
      const ownCount = n.listings.length;
      rent = {
        ...combined,
        basis: ownCount >= MIN_OWN_OBSERVATIONS ? "OWN_OBSERVATIONS" : "BENCHMARK",
        observationCount: ownCount,
        index: latestIndex
          ? {
              cityPerM2: latestIndex.value,
              period: latestIndex.period,
              appliedFactor: factor === null ? null : round(factor, 3),
              baselinePeriod: factor === null ? null : (indexing?.baseline.period ?? null),
              provenance: toProvenance({
                source: latestIndex.source,
                sourceUrl: latestIndex.sourceUrl,
                method: latestIndex.method,
                observedAt: latestIndex.retrievedAt,
              }),
            }
          : null,
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

    // --- Raylı sistem erişimi ---
    let transit: TransitAccess | null = null;

    if (allExisting.length > 0) {
      const own = n.stations.filter((st) => st.stage === "EXISTING");
      const nearest = allExisting.reduce<{ km: number; name: string; line: string } | null>(
        (best, st) => {
          const km = haversineKm({ lat: n.lat, lng: n.lng }, st);
          return best === null || km < best.km
            ? { km, name: st.name, line: lineCode(st.line, st.mode) }
            : best;
        },
        null,
      );
      const first = n.stations[0] ?? allExisting[0];

      transit = {
        existingStations: own.length,
        underConstruction: n.stations.filter((st) => st.stage === "UNDER_CONSTRUCTION")
          .length,
        nearestStationKm: nearest ? round(nearest.km, 1) : null,
        nearestStationName: nearest?.name ?? null,
        nearestStationLine: nearest?.line ?? null,
        modes: [...new Set(own.map((st) => st.mode))].sort(),
        lines: [...new Set(own.map((st) => lineCode(st.line, st.mode)))].sort(),
        stations: own
          .map((st) => {
            const code = lineCode(st.line, st.mode);
            return {
              name: st.name,
              line: code,
              lineName: st.line,
              mode: st.mode,
              lineTotal: lineTotals.get(code) ?? 0,
              km: round(haversineKm({ lat: n.lat, lng: n.lng }, st), 1),
            };
          })
          .sort((a, b) => a.km - b.km),
        provenance: toProvenance({
          source: first.source,
          sourceUrl: first.sourceUrl,
          method: first.method,
          observedAt: first.observedAt,
        }),
      };
      // İlçede istasyon olmaması EKSİK VERİ değil, bilinen bir sıfır - missing'e girmez
    } else {
      missing.push("hızlı ulaşım");
    }

    // --- Otobüs ---
    const bus: BusAccess | null = n.busService
      ? {
          stops: n.busService.stops,
          lines: n.busService.lines,
          weekdayDepartures: n.busService.weekdayDepartures,
          departuresPerStop: n.busService.departuresPerStop,
          rank: busRanking.indexOf(n.slug) + 1,
          provenance: toProvenance({
            source: n.busService.source,
            sourceUrl: n.busService.sourceUrl,
            method: n.busService.method,
            observedAt: n.busService.observedAt,
          }),
        }
      : null;
    if (!bus) missing.push("otobüs");

    return {
      slug: n.slug,
      name: n.name,
      district: n.district,
      city: n.city,
      lat: n.lat,
      lng: n.lng,
      polygon: (n.polygon as number[][][] | null) ?? null,
      rent,
      transit,
      bus,
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
