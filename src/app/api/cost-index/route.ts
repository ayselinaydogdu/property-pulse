import { NextResponse } from "next/server";
import { getNeighborhoodStats } from "@/lib/aggregate";

/**
 * GET /api/cost-index -> yaşam maliyeti sepeti.
 *
 * Şu an boş: ilçe bazlı günlük harcama verisi için bağlanmış gerçek kaynak yok.
 * Uydurma değer döndürmektense boş dönüyor.
 */
export async function GET() {
  const stats = await getNeighborhoodStats();
  const withData = stats.filter((n) => n.cost !== null);

  return NextResponse.json({
    available: withData.length > 0,
    note:
      withData.length > 0
        ? null
        : "İlçe bazlı yaşam maliyeti için bağlanmış veri kaynağı yok. Bkz. README.",
    neighborhoods: withData.map((n) => ({
      slug: n.slug,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      monthly: n.cost!.monthly,
      lines: n.cost!.lines,
    })),
  });
}
