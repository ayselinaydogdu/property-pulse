import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAffordability,
  combineRentSources,
  computeIndexFactor,
  type NeighborhoodStats,
} from "./aggregate";

/** Testin ilgilendiği alanları verip gerisini makul varsayılanlarla dolduran yardımcı. */
function stats(over: Partial<NeighborhoodStats> = {}): NeighborhoodStats {
  return {
    slug: "test",
    name: "Test",
    district: "Test",
    city: "İstanbul",
    lat: 41,
    lng: 29,
    polygon: null,
    rent: {
      perM2Min: 400,
      perM2Max: 400,
      perM2: 400,
      hasSpread: false,
      basis: "BENCHMARK",
      observationCount: 0,
      sources: [],
      index: null,
    },
    cost: null,
    transit: null,
    bus: null,
    missing: [],
    ...over,
  };
}

describe("applyAffordability", () => {
  it("kirayı m² fiyatı × seçilen büyüklük olarak hesaplar", () => {
    const [row] = applyAffordability([stats()], { income: 100_000, areaM2: 90 });
    assert.equal(row.estimatedRent, 36_000);
  });

  it("kira verisi yoksa tahmin üretmez, null döner", () => {
    const [row] = applyAffordability([stats({ rent: null, missing: ["kira"] })], {
      income: 100_000,
      areaM2: 90,
    });
    assert.equal(row.estimatedRent, null);
    assert.equal(row.knownMonthly, null);
    assert.equal(row.leftover, null);
  });

  it("eksik veri varken 'uygun' hükmü vermez - false değil null döner", () => {
    const [row] = applyAffordability([stats({ missing: ["yaşam maliyeti"] })], {
      income: 500_000,
      areaM2: 90,
    });
    // Bütçe fazlasıyla yetiyor ama sepet bilinmediği için hüküm verilemez
    assert.equal(row.affordable, null);
  });

  it("eksik veri yokken eşiğe göre hüküm verir", () => {
    const ucuz = applyAffordability([stats()], {
      income: 200_000,
      areaM2: 90,
      maxBurdenPct: 60,
    });
    assert.equal(ucuz[0].affordable, true);

    const pahali = applyAffordability([stats()], {
      income: 40_000,
      areaM2: 90,
      maxBurdenPct: 60,
    });
    assert.equal(pahali[0].affordable, false);
  });

  it("bilinen kalemleri toplar, eksikleri sıfır saymaz", () => {
    const withCost = stats({
      cost: { monthly: 10_000, lines: [] },
    });
    const [row] = applyAffordability([withCost], { income: 100_000, areaM2: 90 });
    assert.equal(row.estimatedCost, 10_000);
    assert.equal(row.knownMonthly, 46_000);
    assert.equal(row.leftover, 54_000);
  });

  it("hane büyümesi sepeti doğrusal artırmaz - ortak giderler paylaşılır", () => {
    const withCost = stats({ cost: { monthly: 10_000, lines: [] } });
    const [tek] = applyAffordability([withCost], { income: 100_000, areaM2: 90, household: 1 });
    const [iki] = applyAffordability([withCost], { income: 100_000, areaM2: 90, household: 2 });
    assert.equal(tek.estimatedCost, 10_000);
    // 1 + (2-1) * 0.75 = 1.75 kat
    assert.equal(iki.estimatedCost, 17_500);
    assert.ok(iki.estimatedCost! < 20_000, "iki kişi tek kişinin iki katı harcamaz");
  });

  it("kalan paraya göre azalan sıralar, verisi olmayanları sona atar", () => {
    const rows = applyAffordability(
      [
        stats({ slug: "pahali", rent: { ...stats().rent!, perM2: 600 } }),
        stats({ slug: "veriyok", rent: null, missing: ["kira"] }),
        stats({ slug: "ucuz", rent: { ...stats().rent!, perM2: 200 } }),
      ],
      { income: 100_000, areaM2: 90 },
    );
    assert.deepEqual(
      rows.map((r) => r.slug),
      ["ucuz", "pahali", "veriyok"],
    );
  });

  it("kaynaklar çelişiyorsa alt ve üst sınırı da hesaplar", () => {
    const spread = stats({
      rent: { ...stats().rent!, perM2Min: 300, perM2Max: 500, perM2: 400, hasSpread: true },
    });
    const [row] = applyAffordability([spread], { income: 100_000, areaM2: 100 });
    assert.equal(row.estimatedRentMin, 30_000);
    assert.equal(row.estimatedRentMax, 50_000);
    assert.equal(row.estimatedRent, 40_000);
  });

  it("gelir sıfırsa oran hesaplamaz, sıfıra bölmez", () => {
    const [row] = applyAffordability([stats()], { income: 0, areaM2: 90 });
    assert.equal(row.knownBurdenPct, null);
    assert.equal(row.affordable, null);
  });
});

describe("computeIndexFactor", () => {
  const points = [
    { period: "2026-Q1", periodStart: new Date("2026-01-01"), value: 400 },
    { period: "2026-Q2", periodStart: new Date("2026-04-01"), value: 440 },
  ];

  it("çapa serinin son gözleminden yeniyse güncelleme yapmaz", () => {
    // 9 Eylül 2026: taban Q2, son da Q2 -> tazelenecek bir şey yok
    assert.equal(computeIndexFactor(new Date("2026-09-09"), points), null);
  });

  it("çapa bayatsa taban çeyreğe göre oranlar", () => {
    const result = computeIndexFactor(new Date("2026-02-15"), points);
    assert.ok(result);
    assert.equal(result.baseline.period, "2026-Q1");
    assert.equal(result.latest.period, "2026-Q2");
    assert.equal(result.factor, 1.1);
  });

  it("çapa serinin başlangıcından eskiyse taban bulunamaz, güncelleme yapılmaz", () => {
    assert.equal(computeIndexFactor(new Date("2020-01-01"), points), null);
  });

  it("seri boşsa null döner", () => {
    assert.equal(computeIndexFactor(new Date("2026-05-01"), []), null);
  });
});

describe("combineRentSources", () => {
  const prov = (source: string) => ({
    source,
    sourceUrl: null,
    method: "OBSERVED" as const,
    observedAt: "2026-09-10T00:00:00.000Z",
    sampleSize: null,
    note: null,
  });

  it("tek kaynakta aralık göstermez", () => {
    const result = combineRentSources([{ perM2: 559, provenance: prov("KiraMetre") }]);
    assert.ok(result);
    assert.equal(result.perM2, 559);
    assert.equal(result.perM2Min, 559);
    assert.equal(result.perM2Max, 559);
    assert.equal(result.hasSpread, false);
  });

  it("kaynaklar çelişince alt-üst sınırı verir ve medyanı kullanır", () => {
    const result = combineRentSources([
      { perM2: 559, provenance: prov("KiraMetre") },
      { perM2: 583, provenance: prov("Kullanıcı katkısı") },
    ]);
    assert.ok(result);
    assert.equal(result.perM2Min, 559);
    assert.equal(result.perM2Max, 583);
    assert.equal(result.perM2, 571);
    assert.equal(result.hasSpread, true);
    assert.equal(result.sources.length, 2);
  });

  it("aynı değeri veren kaynaklarda aralık yoktur", () => {
    const result = combineRentSources([
      { perM2: 500, provenance: prov("A") },
      { perM2: 500, provenance: prov("B") },
    ]);
    assert.ok(result);
    assert.equal(result.hasSpread, false);
    assert.equal(result.sources.length, 2, "aralık olmasa da her iki kaynak listelenir");
  });

  it("kaynak yoksa null döner - tahmin üretmez", () => {
    assert.equal(combineRentSources([]), null);
  });
});
