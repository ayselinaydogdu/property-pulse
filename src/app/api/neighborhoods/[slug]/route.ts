import { NextResponse } from "next/server";
import { getNeighborhoodStats } from "@/lib/aggregate";

/** GET /api/neighborhoods/kadikoy -> tek semtin detayı (sepet kırılımı dahil) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const stats = await getNeighborhoodStats();
  const match = stats.find((n) => n.slug === slug);

  if (!match) {
    return NextResponse.json({ error: `Semt bulunamadı: ${slug}` }, { status: 404 });
  }
  return NextResponse.json(match);
}
