/**
 * Harita katmanı sabitleri.
 * MapPanel'den ayrı duruyor: Dashboard bunları statik import ediyor ve
 * Leaflet'in sunucu paketine sızmaması gerekiyor (window is not defined).
 */
export type MapMetric = "rent" | "transit" | "bus" | "cost" | "total";

export const METRIC_LABELS: Record<MapMetric, string> = {
  rent: "Kira",
  transit: "Hızlı ulaşıma uzaklık",
  bus: "Otobüs sıklığı",
  cost: "Yaşam maliyeti",
  total: "Toplam aylık",
};

export const METRIC_HINTS: Record<MapMetric, string> = {
  rent: "Koyu renk = pahalı.",
  transit:
    "Koyu renk = hızlı ulaşım uzak. Metro, tramvay, Marmaray, metrobüs; ilçe merkezinden kuş uçuşu mesafe.",
  bus:
    "Koyu renk = otobüs daha sık. Ortalama bir durağa hafta içi günde uğrayan otobüs sayısı.",
  cost: "Koyu renk = pahalı.",
  total: "Koyu renk = pahalı.",
};
