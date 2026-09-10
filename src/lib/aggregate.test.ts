import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAffordability, type NeighborhoodStats } from "./aggregate";

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
