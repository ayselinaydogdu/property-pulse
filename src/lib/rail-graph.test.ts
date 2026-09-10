import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildGraph,
  findRoute,
  nearestStation,
  nodeIdsForStation,
  type RailNetwork,
} from "./rail-graph";

const network = JSON.parse(
  readFileSync("data/rail-network.json", "utf8"),
) as RailNetwork;
const graph = buildGraph(network);

function route(from: string, to: string) {
  return findRoute(graph, nodeIdsForStation(graph, from), nodeIdsForStation(graph, to));
}

describe("rail graph", () => {
  it("ağı kurar", () => {
    assert.ok(graph.nodes.size > 250, `beklenen 250+ düğüm, gelen ${graph.nodes.size}`);
  });

  it("aktarma bağlantıları üretir", () => {
    const transfers = [...graph.edges.values()].flat().filter((e) => e.transfer).length;
    assert.ok(transfers > 0, "hiç aktarma bağlantısı kurulmamış");
  });
});

describe("findRoute - bilinen güzergâhlar", () => {
  it("aynı hat üzerinde aktarmasız yol bulur (Taksim → Şişli, M2)", () => {
    const r = route("Taksim", "Şişli");
    assert.ok(r, "yol bulunamadı");
    assert.equal(r.transfers, 0);
    assert.equal(r.legs[0].line, "M2");
    // Taksim ile Şişli-Mecidiyeköy arasında Osmanbey var
    assert.ok(r.stops <= 3, `beklenen en fazla 3 durak, gelen ${r.stops}`);
  });

  it("Anadolu'dan Avrupa'ya aktarmalı yol bulur (Kadıköy → Levent)", () => {
    const r = route("Kadıköy", "Levent");
    assert.ok(r, "yol bulunamadı");
    assert.ok(r.transfers >= 1, "boğazı aktarmasız geçemez");
    assert.ok(r.km > 10 && r.km < 45, `mesafe makul değil: ${r.km} km`);
    // Marmaray ya da bir metro hattı kullanılmalı
    assert.ok(r.legs.length >= 2);
  });

  it("uzun hat üzerinde makul mesafe verir (Bağcılar → Kabataş, T1)", () => {
    const r = route("Bağcılar", "Kabataş");
    assert.ok(r);
    // T1 hattı yaklaşık 19 km
    assert.ok(r.km > 12 && r.km < 30, `beklenen 12-30 km, gelen ${r.km}`);
  });

  it("bilinmeyen istasyonda null döner", () => {
    assert.equal(findRoute(graph, nodeIdsForStation(graph, "Yok Böyle Bir Yer"), []), null);
  });

  it("bacaklar birbirine zincirli - bir bacağın varışı sonrakinin kalkışına yakın", () => {
    const r = route("Kadıköy", "Levent");
    assert.ok(r);
    assert.ok(r.legs.every((leg) => leg.stops > 0), "sıfır duraklık bacak olmamalı");
    assert.equal(
      r.stops,
      r.legs.reduce((sum, leg) => sum + leg.stops, 0),
      "toplam durak, bacakların toplamına eşit olmalı",
    );
  });
});

describe("nearestStation", () => {
  it("Kadıköy merkezine en yakın istasyonu bulur", () => {
    const found = nearestStation(graph, { lat: 40.9903, lng: 29.029 });
    assert.ok(found);
    assert.ok(found.km < 2, `beklenen 2 km'den yakın, gelen ${found.km}`);
  });
});
