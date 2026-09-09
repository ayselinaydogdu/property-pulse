/**
 * Harita katmanı sabitleri.
 * MapPanel'den ayrı duruyor: Dashboard bunları statik import ediyor ve
 * Leaflet'in sunucu paketine sızmaması gerekiyor (window is not defined).
 */
export type MapMetric = "rent" | "transit" | "cost" | "total";

export const METRIC_LABELS: Record<MapMetric, string> = {
  rent: "Kira",
  transit: "Raylı sisteme uzaklık",
  cost: "Yaşam maliyeti",
  total: "Toplam aylık",
};

export const METRIC_HINTS: Record<MapMetric, string> = {
  rent: "Koyu renk = pahalı.",
  transit: "Koyu renk = raylı sistem uzak. İlçe merkezinden kuş uçuşu mesafe.",
  cost: "Koyu renk = pahalı.",
  total: "Koyu renk = pahalı.",
};
