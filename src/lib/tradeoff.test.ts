import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paretoOptimal, type TradeoffItem } from "./tradeoff";

describe("paretoOptimal", () => {
  it("hem daha pahalı hem daha uzak olanı eler", () => {
    const items: TradeoffItem[] = [
      { slug: "iyi", rent: 20_000, stops: 5 },
      { slug: "kotu", rent: 30_000, stops: 10 },
    ];
    const kept = paretoOptimal(items);
    assert.ok(kept.has("iyi"));
    assert.ok(!kept.has("kotu"), "her iki boyutta da yenilen ilçe elenmeliydi");
  });

  it("ödünleşim varsa ikisini de tutar", () => {
    // Biri ucuz ama uzak, diğeri pahalı ama yakın - hangisi iyi, kullanıcıya bağlı
    const items: TradeoffItem[] = [
      { slug: "ucuz-uzak", rent: 18_000, stops: 20 },
      { slug: "pahali-yakin", rent: 45_000, stops: 2 },
    ];
    assert.equal(paretoOptimal(items).size, 2);
  });

  it("tek boyutta yenmek elemeye yetmez", () => {
    const items: TradeoffItem[] = [
      { slug: "a", rent: 20_000, stops: 10 },
      { slug: "b", rent: 25_000, stops: 4 },
    ];
    assert.equal(paretoOptimal(items).size, 2);
  });

  it("eşit değerli ilçelerde ikisi de kalır", () => {
    const items: TradeoffItem[] = [
      { slug: "a", rent: 20_000, stops: 5 },
      { slug: "b", rent: 20_000, stops: 5 },
    ];
    assert.equal(paretoOptimal(items).size, 2);
  });

  it("bir ilçe kendini elemez", () => {
    assert.deepEqual([...paretoOptimal([{ slug: "tek", rent: 1, stops: 1 }])], ["tek"]);
  });

  it("boş listede boş küme döner", () => {
    assert.equal(paretoOptimal([]).size, 0);
  });
});
