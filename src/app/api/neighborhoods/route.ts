import { NextResponse } from "next/server";
import { getNeighborhoodStats } from "@/lib/aggregate";

/** GET /api/neighborhoods -> tüm semtler için kira + yaşam maliyeti göstergeleri */
export async function GET() {
  const stats = await getNeighborhoodStats();
  return NextResponse.json({ count: stats.length, neighborhoods: stats });
}
