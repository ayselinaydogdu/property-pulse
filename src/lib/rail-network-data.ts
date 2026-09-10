import { buildGraph, type Graph, type RailNetwork } from "@/lib/rail-graph";
// Doğrudan import: dosya derleme sırasında pakete gömülür. Çalışma anında
// diskten okumak sunucusuz ortamda çalışmaz - dosya fonksiyon paketine
// dahil edilmeyebilir.
import networkJson from "../../data/rail-network.json";

const network = networkJson as unknown as RailNetwork;

let cachedGraph: Graph | null = null;

/** Graf bir kez kurulup bellekte tutulur - her istekte yeniden kurmak gereksiz. */
export function getRailGraph(): { network: RailNetwork; graph: Graph } {
  if (!cachedGraph) cachedGraph = buildGraph(network);
  return { network, graph: cachedGraph };
}

/** Arayüzdeki istasyon seçici için: benzersiz istasyon adları, hatlarıyla. */
export function listStations(): { name: string; lines: string[] }[] {
  const byName = new Map<string, Set<string>>();
  for (const [line, data] of Object.entries(network.lines)) {
    for (const station of data.stations) {
      const set = byName.get(station.name);
      if (set) set.add(line);
      else byName.set(station.name, new Set([line]));
    }
  }
  return [...byName.entries()]
    .map(([name, lines]) => ({ name, lines: [...lines].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}
