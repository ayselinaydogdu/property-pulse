"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AffordabilityRow } from "@/lib/aggregate";
import { METRIC_LABELS, type MapMetric } from "@/lib/map-metrics";
import { formatKm, formatTRY } from "@/lib/format";

/** Sequential mavi rampa (açık = düşük, koyu = yüksek). */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];

/** Verisi olmayan ilçe için null - haritada boyanmaz. */
function metricValue(row: AffordabilityRow, metric: MapMetric): number | null {
  if (metric === "rent") return row.estimatedRent;
  if (metric === "transit") return row.transit?.nearestStationKm ?? null;
  if (metric === "bus") return row.bus?.departuresPerStop ?? null;
  if (metric === "cost") return row.estimatedCost;
  return row.knownMonthly;
}

/** Ölçek etiketi metriğe göre değişir: kira ₺, uzaklık km. */
function formatMetric(value: number, metric: MapMetric): string {
  if (metric === "transit") return formatKm(value);
  if (metric === "bus") return `${value}/gün`;
  return formatTRY(value);
}

/** Değeri min-max aralığında rampanın bir adımına eşler. */
function rampStep(value: number, min: number, max: number): string {
  if (max <= min) return RAMP[2];
  const ratio = (value - min) / (max - min);
  return RAMP[Math.min(RAMP.length - 1, Math.floor(ratio * RAMP.length))];
}

function popupHtml(row: AffordabilityRow): string {
  const source = row.rent?.sources[0];
  return `<div style="font-family:system-ui,sans-serif;font-size:13px;min-width:200px">
     <div style="font-weight:600;margin-bottom:4px">${row.name}</div>
     <div>Kira (${row.areaM2} m²): <b>${
       row.estimatedRent !== null ? formatTRY(row.estimatedRent) : "veri yok"
     }</b></div>
     <div>m² birim kira: <b>${row.rent ? `${row.rent.perM2} ₺` : "veri yok"}</b></div>
     <div>Yaşam maliyeti: <b>${
       row.estimatedCost !== null ? formatTRY(row.estimatedCost) : "veri yok"
     }</b></div>
     ${
       row.bus
         ? `<div>Otobüs: <b>${row.bus.departuresPerStop}/gün</b> (durak başına)</div>`
         : ""
     }
     ${
       row.transit
         ? `<div style="margin-top:4px">Raylı sistem: <b>${
             row.transit.existingStations > 0
               ? `${row.transit.existingStations} istasyon (${row.transit.modes.join(", ")})`
               : "yok"
           }</b></div>
            <div>En yakın istasyon: <b>${formatKm(row.transit.nearestStationKm ?? 0)}</b> · ${
              row.transit.nearestStationName
            }</div>`
         : ""
     }
     ${
       source
         ? `<div style="margin-top:4px;color:#898781;font-size:11px">Kaynak: ${source.source}</div>`
         : ""
     }
   </div>`;
}

export default function MapPanel({
  rows,
  metric,
  selectedSlug,
  onSelect,
}: {
  rows: AffordabilityRow[];
  metric: MapMetric;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Sadece ilk çizimde sığdır - kullanıcı yakınlaştırdıysa geri alma
  const didFitRef = useRef(false);
  // Effect içinden güncel callback'e erişmek için - map yeniden kurulmasın diye
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const range = useMemo(() => {
    const values = rows
      .map((r) => metricValue(r, metric))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return { min: 0, max: 0, empty: true };
    return { min: Math.min(...values), max: Math.max(...values), empty: false };
  }, [rows, metric]);

  // Harita bir kez kurulur
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    // Başlangıç görünümü: işaretçiler gelince fitBounds ile değiştirilir
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
      [41.02, 28.96],
      9,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap katkıda bulunanları",
      maxZoom: 18,
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Veri / metrik / seçim değişince katman yeniden çizilir
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const row of rows) {
      const value = metricValue(row, metric);
      // Verisi olmayan ilçeyi boyamak, tahmin üretmek olurdu
      if (value === null) continue;
      const isSelected = selectedSlug === row.slug;
      const fill = rampStep(value, range.min, range.max);

      // Kira ilçenin tamamına ait bir değer; noktaya değil alana boyanır
      if (row.polygon) {
        // GeoJSON [lng, lat] -> Leaflet [lat, lng]
        const rings = row.polygon.map((ring) =>
          ring.map(([lng, lat]) => [lat, lng] as [number, number]),
        );
        const shape = L.polygon(rings, {
          fillColor: fill,
          fillOpacity: !selectedSlug || isSelected ? 0.75 : 0.4,
          // Komşu ilçeler birbirinden ayrışsın diye yüzey rengiyle ince çizgi
          color: isSelected ? "#0b0b0b" : "#fcfcfb",
          weight: isSelected ? 2.5 : 1,
        });
        shape.bindTooltip(`${row.name} · ${formatMetric(value, metric)}`, { sticky: true });
        shape.bindPopup(popupHtml(row));
        shape.on("click", () => onSelectRef.current(row.slug));
        shape.on("mouseover", () => shape.setStyle({ fillOpacity: 0.9 }));
        shape.on("mouseout", () =>
          shape.setStyle({ fillOpacity: !selectedSlug || isSelected ? 0.75 : 0.4 }),
        );
        shape.addTo(layer);
        bounds.extend(shape.getBounds());
      } else {
        // Sınır verisi olmayan ilçe için merkez noktası
        const marker = L.circleMarker([row.lat, row.lng], {
          radius: 8,
          fillColor: fill,
          fillOpacity: 0.9,
          color: "#fcfcfb",
          weight: 2,
        });
        marker.bindTooltip(`${row.name} · ${formatMetric(value, metric)}`, {
          direction: "top",
          offset: [0, -8],
        });
        marker.bindPopup(popupHtml(row));
        marker.on("click", () => onSelectRef.current(row.slug));
        marker.addTo(layer);
        bounds.extend([row.lat, row.lng]);
      }
    }

    // İstanbul batıda Çatalca'ya, doğuda Şile'ye uzanıyor - sabit görünüm uçları kırpıyor
    if (bounds.isValid() && !didFitRef.current) {
      mapRef.current?.fitBounds(bounds, { padding: [16, 16] });
      didFitRef.current = true;
    }
  }, [rows, metric, selectedSlug, range]);

  return (
    <div>
      <div
        ref={containerRef}
        className="h-[380px] w-full rounded-xl"
        style={{ border: "1px solid var(--border)" }}
        role="application"
        aria-label={`${METRIC_LABELS[metric]} haritası`}
      />
      <div
        className="mt-3 flex items-center gap-2 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <span>{formatMetric(range.min, metric)}</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {RAMP.map((color) => (
            <span key={color} className="flex-1" style={{ background: color }} />
          ))}
        </div>
        <span>{formatMetric(range.max, metric)}</span>
      </div>
    </div>
  );
}
