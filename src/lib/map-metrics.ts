/**
 * Harita katmanı sabitleri.
 * MapPanel'den ayrı duruyor: Dashboard bunları statik import ediyor ve
 * Leaflet'in sunucu paketine sızmaması gerekiyor (window is not defined).
 */
export type MapMetric = "rent" | "cost" | "total";

export const METRIC_LABELS: Record<MapMetric, string> = {
  rent: "Kira",
  cost: "Yaşam maliyeti",
  total: "Toplam aylık",
};
