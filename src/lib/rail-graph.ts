/**
 * Raylı sistem ağında en kısa yol.
 *
 * Düğümler istasyonlar, kenarlar iki türlü:
 *  - Aynı hattaki ardışık istasyonlar (ağırlık: aralarındaki km)
 *  - Yürüme mesafesindeki farklı hat istasyonları = aktarma
 *
 * NE HESAPLIYOR: kaç durak, kaç aktarma, kaç km. Hepsi veriden çıkıyor.
 * NE HESAPLAMIYOR: dakika. Metro/tramvay hız verisi elimizde yok; uydurma bir
 * hız katsayısıyla süre üretmek yanıltıcı olur. Süre, hız verisi bulununca
 * eklenecek.
 */
import { haversineKm } from "@/lib/geo";

/** Aktarma sayılacak azami yürüme mesafesi. */
const TRANSFER_MAX_KM = 0.4;

/**
 * Aktarmanın maliyeti - km cinsinden "ceza".
 *
 * Bu bir ÖLÇÜM DEĞİL, modelleme tercihidir: sırf mesafeyi en aza indiren yol
 * bazen üç aktarmalı saçma güzergâhlar üretiyor. Ceza olmadan algoritma
 * yolcunun aktarmadan kaçındığını bilemez. Değer, "bir aktarma yaklaşık 2 km
 * yol kadar zahmetlidir" varsayımına dayanır.
 */
export const TRANSFER_PENALTY_KM = 2;

export type NetworkStation = { name: string; lat: number; lng: number; kmFromPrev: number };
export type NetworkLine = { lineName: string; mode: string; stations: NetworkStation[] };
export type RailNetwork = { lines: Record<string, NetworkLine> };

/** Bir istasyon, hattıyla birlikte. Aynı isim farklı hatlarda ayrı düğümdür. */
type Node = { id: string; line: string; name: string; lat: number; lng: number };
type Edge = { to: string; km: number; transfer: boolean };

export type Graph = { nodes: Map<string, Node>; edges: Map<string, Edge[]> };

function nodeId(line: string, name: string): string {
  return `${line}::${name}`;
}

export function buildGraph(network: RailNetwork): Graph {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge[]>();

  const addEdge = (from: string, to: string, km: number, transfer: boolean) => {
    const list = edges.get(from);
    if (list) list.push({ to, km, transfer });
    else edges.set(from, [{ to, km, transfer }]);
  };

  // 1) Hat içi kenarlar
  for (const [line, data] of Object.entries(network.lines)) {
    data.stations.forEach((station, index) => {
      const id = nodeId(line, station.name);
      nodes.set(id, { id, line, name: station.name, lat: station.lat, lng: station.lng });
      if (index === 0) return;
      const prev = data.stations[index - 1];
      const prevId = nodeId(line, prev.name);
      // Çift yönlü: hatlar iki yönde de işliyor
      addEdge(prevId, id, station.kmFromPrev, false);
      addEdge(id, prevId, station.kmFromPrev, false);
    });
  }

  // 2) Aktarma kenarları - yürüme mesafesindeki farklı hat istasyonları
  const all = [...nodes.values()];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.line === b.line) continue;
      const km = haversineKm(a, b);
      if (km > TRANSFER_MAX_KM) continue;
      addEdge(a.id, b.id, km, true);
      addEdge(b.id, a.id, km, true);
    }
  }

  return { nodes, edges };
}

export type Leg = { line: string; from: string; to: string; stops: number; km: number };

export type Route = {
  /** Toplam hat boyu mesafe (yürüme aktarmaları dahil), km */
  km: number;
  /** Kaç durak gidiliyor (aktarma yürüyüşleri sayılmaz) */
  stops: number;
  transfers: number;
  legs: Leg[];
};

/**
 * Dijkstra ile en kısa yol.
 *
 * Maliyet = mesafe + aktarma başına TRANSFER_PENALTY_KM. Ceza sadece yol
 * seçimini etkiler; döndürülen `km` gerçek mesafedir, cezayı içermez.
 */
export function findRoute(graph: Graph, fromIds: string[], toIds: string[]): Route | null {
  const targets = new Set(toIds.filter((id) => graph.nodes.has(id)));
  const starts = fromIds.filter((id) => graph.nodes.has(id));
  if (targets.size === 0 || starts.length === 0) return null;

  const cost = new Map<string, number>();
  const realKm = new Map<string, number>();
  const prev = new Map<string, { id: string; transfer: boolean; km: number }>();
  // Küçük ağ (268 düğüm) - basit dizi kuyruğu yeterli, öncelik kuyruğuna gerek yok
  const queue = new Set<string>();

  for (const id of starts) {
    cost.set(id, 0);
    realKm.set(id, 0);
    queue.add(id);
  }

  let best: string | null = null;
  while (queue.size > 0) {
    let current: string | null = null;
    let currentCost = Infinity;
    for (const id of queue) {
      const c = cost.get(id) ?? Infinity;
      if (c < currentCost) {
        currentCost = c;
        current = id;
      }
    }
    if (current === null) break;
    queue.delete(current);

    if (targets.has(current)) {
      best = current;
      break;
    }

    for (const edge of graph.edges.get(current) ?? []) {
      const next = currentCost + edge.km + (edge.transfer ? TRANSFER_PENALTY_KM : 0);
      if (next < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, next);
        realKm.set(edge.to, (realKm.get(current) ?? 0) + edge.km);
        prev.set(edge.to, { id: current, transfer: edge.transfer, km: edge.km });
        queue.add(edge.to);
      }
    }
  }

  if (best === null) return null;

  // Yolu geriye doğru topla
  const path: { node: Node; transfer: boolean; km: number }[] = [];
  let cursor: string | null = best;
  while (cursor) {
    const step = prev.get(cursor);
    path.unshift({
      node: graph.nodes.get(cursor)!,
      transfer: step?.transfer ?? false,
      km: step?.km ?? 0,
    });
    cursor = step?.id ?? null;
  }

  // Bacaklara ayır: her aktarma yeni bir bacak başlatır
  const legs: Leg[] = [];
  let stops = 0;
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (step.transfer) continue;
    stops++;
    const last = legs.at(-1);
    if (last && last.line === step.node.line) {
      last.to = step.node.name;
      last.stops++;
      last.km = Math.round((last.km + step.km) * 100) / 100;
    } else {
      legs.push({
        line: step.node.line,
        from: path[i - 1].node.name,
        to: step.node.name,
        stops: 1,
        km: Math.round(step.km * 100) / 100,
      });
    }
  }

  return {
    km: Math.round((realKm.get(best) ?? 0) * 100) / 100,
    stops,
    transfers: Math.max(0, legs.length - 1),
    legs,
  };
}

/** Bir istasyon adının tüm hatlardaki düğüm kimlikleri (aynı isim birden çok hatta olabilir). */
export function nodeIdsForStation(graph: Graph, name: string): string[] {
  return [...graph.nodes.values()].filter((n) => n.name === name).map((n) => n.id);
}

/** Verilen noktaya en yakın istasyonun adı ve mesafesi. */
export function nearestStation(
  graph: Graph,
  point: { lat: number; lng: number },
): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null;
  for (const node of graph.nodes.values()) {
    const km = haversineKm(point, node);
    if (!best || km < best.km) best = { name: node.name, km };
  }
  return best;
}
