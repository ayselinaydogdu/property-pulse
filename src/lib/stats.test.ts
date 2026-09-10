import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iqrFilter, median, quantile, round } from "./stats";

describe("median", () => {
  it("tek sayıda elemanda ortadakini döner", () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it("çift sayıda elemanda ortadaki ikisinin ortalamasını döner", () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it("girdiyi sıralamak zorunda değil", () => {
    assert.equal(median([10, 1, 5]), 5);
  });

  it("boş dizide 0 döner", () => {
    assert.equal(median([]), 0);
  });

  it("aykırı değerden etkilenmez - ortalamadan farkı bu", () => {
    assert.equal(median([10, 12, 11, 13, 5000]), 12);
  });
});

describe("quantile", () => {
  const sorted = [1, 2, 3, 4, 5];

  it("uç noktaları verir", () => {
    assert.equal(quantile(sorted, 0), 1);
    assert.equal(quantile(sorted, 1), 5);
  });

  it("ara değerlerde doğrusal ara değerleme yapar", () => {
    assert.equal(quantile(sorted, 0.5), 3);
    assert.equal(quantile([1, 2], 0.5), 1.5);
  });

  it("boş dizide 0 döner", () => {
    assert.equal(quantile([], 0.5), 0);
  });
});

describe("iqrFilter", () => {
  it("Tukey çitinin dışındaki değerleri atar", () => {
    // 10-13 aralığında yoğunlaşan veri; 5000 açık aykırı
    const rows = [10, 11, 12, 13, 11, 12, 5000].map((v) => ({ v }));
    const kept = iqrFilter(rows, (r) => r.v).map((r) => r.v);
    assert.ok(!kept.includes(5000), "aykırı değer elenmeliydi");
    assert.equal(kept.length, 6);
  });

  it("çok az kayıt varsa dokunmaz - çeyreklik anlamlı olmaz", () => {
    const rows = [{ v: 1 }, { v: 1000 }];
    assert.equal(iqrFilter(rows, (r) => r.v).length, 2);
  });

  it("aykırı değer yoksa hepsini korur", () => {
    const rows = [10, 11, 12, 13].map((v) => ({ v }));
    assert.equal(iqrFilter(rows, (r) => r.v).length, 4);
  });

  it("k büyüdükçe daha az eler", () => {
    // Q1=11, Q3=12.5, IQR=1.5 -> k=1.5'te üst sınır 14.75 (20 elenir),
    // k=10'da 27.5 (20 kalır). Sınırı aşan bir değer seçmek şart.
    const rows = [10, 11, 12, 13, 11, 12, 20].map((v) => ({ v }));
    const dar = iqrFilter(rows, (r) => r.v, 1.5).length;
    const genis = iqrFilter(rows, (r) => r.v, 10).length;
    assert.equal(dar, 6);
    assert.equal(genis, 7);
  });
});

describe("round", () => {
  it("varsayılan olarak tam sayıya yuvarlar", () => {
    assert.equal(round(2.5), 3);
    assert.equal(round(2.4), 2);
  });

  it("istenen basamağa yuvarlar", () => {
    assert.equal(round(1.2345, 2), 1.23);
    assert.equal(round(1.005, 1), 1);
  });
});
