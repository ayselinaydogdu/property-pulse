import { NextResponse } from "next/server";
import { getNeighborhoodStats } from "@/lib/aggregate";
import { findRoute, nodeIdsForStation } from "@/lib/rail-graph";
import { getRailGraph, listStations } from "@/lib/rail-network-data";

/**
 * GET /api/commute -> seçilebilecek hedefler (istasyonlar + ilçeler)
 * GET /api/commute?to=Levent    -> istasyon adı
 * GET /api/commute?to=Beşiktaş  -> ilçe adı; o ilçenin en yakın istasyonuna çevrilir
 *
 * İnsanlar iş yerinin hangi istasyona yakın olduğunu bilmeyebilir ama hangi
 * ilçede olduğunu bilir; bu yüzden ilçe adı da kabul ediliyor.
 */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("to");
  const stats = await getNeighborhoodStats();

  if (!target) {
    return NextResponse.json({
      stations: listStations(),
      districts: stats
        .filter((n) => n.transit?.nearestStationName)
        .map((n) => ({ name: n.name, nearestStation: n.transit!.nearestStationName })),
    });
  }

  const { graph } = getRailGraph();
  const normalize = (v: string) => v.trim().toLocaleLowerCase("tr");

  let toIds = nodeIdsForStation(graph, target);
  let resolvedFrom: { type: "district"; name: string; station: string } | null = null;

  if (toIds.length === 0) {
    // İstasyon değilse ilçe olabilir - o ilçenin en yakın istasyonuna çevir
    const district = stats.find((n) => normalize(n.name) === normalize(target));
    const station = district?.transit?.nearestStationName;
    if (district && station) {
      toIds = nodeIdsForStation(graph, station);
      resolvedFrom = { type: "district", name: district.name, station };
    }
  }

  if (toIds.length === 0) {
    return NextResponse.json(
      { error: `Bulunamadı: ${target}. Bir istasyon ya da ilçe adı yaz.` },
      { status: 404 },
    );
  }

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
    resolvedFrom,
    note: "Yolculuk, ilçe merkezine en yakın istasyondan başlar - kullanıcının evinden değil. Süre değil durak/aktarma/mesafe verilir: raylı sistem hız verisi bağlanmadı.",
    reachableCount: reachable.length,
    neighborhoods: results.sort((a, b) => {
      if (!a.route) return 1;
      if (!b.route) return -1;
      return a.route.stops - b.route.stops;
    }),
  });
}
