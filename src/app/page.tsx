import Dashboard, { type DashboardInput } from "@/components/Dashboard";
import { applyAffordability, getNeighborhoodStats } from "@/lib/aggregate";

// Aggregasyon veritabanından okuyor - her istekte tazelensin
export const dynamic = "force-dynamic";

const DEFAULT_INPUT: DashboardInput = {
  income: 75_000,
  // Veriden gelmiyor, kullanıcının seçimi - arayüzde "senin seçimin" diye işaretli
  areaM2: 90,
  household: 1,
  maxBurdenPct: 60,
};

export default async function Home() {
  const stats = await getNeighborhoodStats();
  const rows = applyAffordability(stats, DEFAULT_INPUT);

  return <Dashboard initialRows={rows} initialInput={DEFAULT_INPUT} />;
}
