import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGraph, type Graph, type RailNetwork } from "@/lib/rail-graph";

let cached: { network: RailNetwork; graph: Graph } | null = null;

/** Ağı bir kez okuyup grafı bellekte tutar - her istekte yeniden kurmak gereksiz. */
export function getRailGraph(): { network: RailNetwork; graph: Graph } {
  if (!cached) {
    const network = JSON.parse(
      readFileSync(join(process.cwd(), "data", "rail-network.json"), "utf8"),
    ) as RailNetwork;
    cached = { network, graph: buildGraph(network) };
  }
  return cached;
}

/** Arayüzdeki istasyon seçici için: benzersiz istasyon adları, hatlarıyla. */
export function listStations(): { name: string; lines: string[] }[] {
  const { network } = getRailGraph();
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
