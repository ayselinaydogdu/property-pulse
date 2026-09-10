import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { haversineKm, pointInRing } from "./geo";

describe("haversineKm", () => {
  it("aynı nokta için sıfır döner", () => {
    const p = { lat: 41.0, lng: 29.0 };
    assert.equal(haversineKm(p, p), 0);
  });

  it("bilinen mesafeyi makul hatayla verir (Kadıköy - Beşiktaş ~5 km)", () => {
    const km = haversineKm({ lat: 40.9903, lng: 29.029 }, { lat: 41.043, lng: 29.0094 });
    assert.ok(km > 5 && km < 7, `beklenen 5-7 km, gelen ${km}`);
  });

  it("simetriktir", () => {
    const a = { lat: 41.0, lng: 28.9 };
    const b = { lat: 40.8, lng: 29.4 };
    assert.equal(haversineKm(a, b), haversineKm(b, a));
  });

  it("bir derece enlem ~111 km", () => {
    const km = haversineKm({ lat: 41, lng: 29 }, { lat: 42, lng: 29 });
    assert.ok(Math.abs(km - 111.2) < 0.5, `beklenen ~111 km, gelen ${km}`);
  });
});

describe("pointInRing", () => {
  // [lng, lat] sırası - GeoJSON ile aynı
  const kare: number[][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  it("içerideki noktayı bulur", () => {
    assert.equal(pointInRing(5, 5, kare), true);
  });

  it("dışarıdaki noktayı eler", () => {
    assert.equal(pointInRing(15, 5, kare), false);
    assert.equal(pointInRing(5, -1, kare), false);
  });

  it("içbükey şekilde girintiyi doğru işler", () => {
    // U şekli: ortadaki boşluk dışarıda sayılmalı
    const u: number[][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 3],
      [3, 3],
      [3, 10],
      [0, 10],
      [0, 0],
    ];
    assert.equal(pointInRing(5, 8, u), false, "girintideki nokta dışarıda olmalı");
    assert.equal(pointInRing(5, 1, u), true, "tabandaki nokta içeride olmalı");
  });
});
