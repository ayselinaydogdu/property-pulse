import { NextResponse } from "next/server";
import { getNeighborhoodStats } from "@/lib/aggregate";
import { findRoute, nodeIdsForStation } from "@/lib/rail-graph";
import { getRailGraph, listStations } from "@/lib/rail-network-data";

/** GET /api/commute -> seçilebilecek istasyonlar */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("to");
  if (!target) {
    return NextResponse.json({ stations: listStations() });
  }

  const { graph } = getRailGraph();
  const toIds = nodeIdsForStation(graph, target);
  if (toIds.length === 0) {
    return NextResponse.json({ error: `İstasyon bulunamadı: ${target}` }, { status: 404 });
  }

  const stats = await getNeighborhoodStats();

  const results = stats.map((n) => {
    // İlçenin merkezine en yakın istasyondan yola çıkılıyor - kullanıcının
    // evinden değil. Ev ilçenin neresindeyse gerçek yolculuk farklı olur.
    const originName = n.transit?.nearestStationName ?? null;
    if (!originName) {
      return { slug: n.slug, name: n.name, route: null, origin: null };
    }
    const route = findRoute(graph, nodeIdsForStation(graph, originName), toIds);
    return {
      slug: n.slug,
      name: n.name,
      origin: { station: originName, kmFromCenter: n.transit?.nearestStationKm ?? null },
      route,
    };
  });

  const reachable = results.filter((r) => r.route !== null);

  return NextResponse.json({
    target,
    note: "Yolculuk, ilçe merkezine en yakın istasyondan başlar - kullanıcının evinden değil. Süre değil durak/aktarma/mesafe verilir: raylı sistem hız verisi bağlanmadı.",
    reachableCount: reachable.length,
    neighborhoods: results.sort((a, b) => {
      if (!a.route) return 1;
      if (!b.route) return -1;
      return a.route.stops - b.route.stops;
    }),
  });
}
