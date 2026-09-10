import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, parseContribution } from "./contributions";

describe("parseContribution - kira", () => {
  const gecerli = {
    kind: "rent",
    neighborhoodSlug: "kadikoy",
    areaM2: 90,
    monthlyRent: 48_000,
    rooms: "2+1",
  };

  it("geçerli katkıyı kabul eder", () => {
    const result = parseContribution(gecerli);
    assert.ok(result.ok);
    // Verilmeyen isteğe bağlı alanlar null olarak normalleşir
    assert.deepEqual(result.value, { ...gecerli, kind: "rent", subArea: null });
  });

  it("sınırların dışındaki kirayı reddeder", () => {
    for (const rent of [LIMITS.monthlyRent.min - 1, LIMITS.monthlyRent.max + 1]) {
      const result = parseContribution({ ...gecerli, monthlyRent: rent });
      assert.equal(result.ok, false, `${rent} reddedilmeliydi`);
    }
  });

  it("sınırların dışındaki büyüklüğü reddeder", () => {
    const result = parseContribution({ ...gecerli, areaM2: 5 });
    assert.equal(result.ok, false);
  });

  it("sayı olmayan değeri reddeder", () => {
    const result = parseContribution({ ...gecerli, monthlyRent: "48000" });
    assert.equal(result.ok, false);
  });

  it("ilçe yoksa reddeder", () => {
    const result = parseContribution({ ...gecerli, neighborhoodSlug: "" });
    assert.equal(result.ok, false);
  });

  it("ondalıklı büyüklüğü ve kirayı tam sayıya yuvarlar", () => {
    const result = parseContribution({ ...gecerli, areaM2: 90.7, monthlyRent: 48_000.4 });
    assert.ok(result.ok);
    assert.equal(result.value.kind === "rent" && result.value.areaM2, 91);
    assert.equal(result.value.kind === "rent" && result.value.monthlyRent, 48_000);
  });

  it("oda bilgisi boşsa null olur, uzunsa kısaltılır", () => {
    const bos = parseContribution({ ...gecerli, rooms: "   " });
    assert.ok(bos.ok && bos.value.kind === "rent");
    assert.equal(bos.value.rooms, null);

    const uzun = parseContribution({ ...gecerli, rooms: "x".repeat(50) });
    assert.ok(uzun.ok && uzun.value.kind === "rent");
    assert.equal(uzun.value.rooms?.length, 10);
  });
});

describe("parseContribution - fiyat", () => {
  it("ilçesiz fiyatı kabul eder (şehir geneli kalemler için)", () => {
    const result = parseContribution({ kind: "price", itemSlug: "coffee", price: 150 });
    assert.ok(result.ok);
    assert.equal(result.value.kind === "price" && result.value.neighborhoodSlug, null);
  });

  it("sınır dışı fiyatı reddeder", () => {
    const result = parseContribution({ kind: "price", itemSlug: "coffee", price: 0 });
    assert.equal(result.ok, false);
  });
});

describe("parseContribution - genel", () => {
  it("bilinmeyen türü reddeder", () => {
    assert.equal(parseContribution({ kind: "başka" }).ok, false);
  });

  it("nesne olmayan gövdeyi reddeder", () => {
    assert.equal(parseContribution(null).ok, false);
    assert.equal(parseContribution("merhaba").ok, false);
  });
});

describe("parseContribution - mahalle", () => {
  const temel = {
    kind: "rent",
    neighborhoodSlug: "kadikoy",
    areaM2: 90,
    monthlyRent: 48_000,
  };

  it("mahalleyi kaydeder", () => {
    const result = parseContribution({ ...temel, subArea: "Moda" });
    assert.ok(result.ok && result.value.kind === "rent");
    assert.equal(result.value.subArea, "Moda");
  });

  it("boş mahalle null olur", () => {
    const result = parseContribution({ ...temel, subArea: "   " });
    assert.ok(result.ok && result.value.kind === "rent");
    assert.equal(result.value.subArea, null);
  });

  it("mahalle verilmezse null olur - zorunlu değil", () => {
    const result = parseContribution(temel);
    assert.ok(result.ok && result.value.kind === "rent");
    assert.equal(result.value.subArea, null);
  });

  it("aşırı uzun mahalle adı kırpılır", () => {
    const result = parseContribution({ ...temel, subArea: "a".repeat(200) });
    assert.ok(result.ok && result.value.kind === "rent");
    assert.equal(result.value.subArea?.length, 60);
  });
});
