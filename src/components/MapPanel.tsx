"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AffordabilityRow } from "@/lib/aggregate";
import { METRIC_LABELS, type MapMetric } from "@/lib/map-metrics";
import { formatTRY } from "@/lib/format";

/** Sequential mavi rampa (açık = düşük, koyu = yüksek). */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];

/** Verisi olmayan semt için null - haritada işaretçi çizilmez. */
function metricValue(row: AffordabilityRow, metric: MapMetric): number | null {
  if (metric === "rent") return row.estimatedRent;
  if (metric === "cost") return row.estimatedCost;
  return row.knownMonthly;
}

/** Değeri min-max aralığında rampanın bir adımına eşler. */
function rampStep(value: number, min: number, max: number): string {
  if (max <= min) return RAMP[2];
  const ratio = (value - min) / (max - min);
  return RAMP[Math.min(RAMP.length - 1, Math.floor(ratio * RAMP.length))];
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

  // Veri / metrik / seçim değişince işaretçiler yeniden çizilir
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const points: L.LatLngExpression[] = [];

    for (const row of rows) {
      const value = metricValue(row, metric);
      // Verisi olmayan semti haritada göstermek, tahmin üretmek olurdu
      if (value === null) continue;
      const isSelected = selectedSlug === row.slug;

      const marker = L.circleMarker([row.lat, row.lng], {
        radius: isSelected ? 16 : 10,
        fillColor: rampStep(value, range.min, range.max),
        // Seçim boyut + doygunlukla anlatılır; renk metriğe ayrılmıştır
        fillOpacity: !selectedSlug || isSelected ? 0.9 : 0.5,
        // 2px yüzey halkası: üst üste binen işaretçiler ayrışsın
        color: "#fcfcfb",
        weight: isSelected ? 3 : 2,
      });

      // 39 ilçede kalıcı etiketler üst üste biner - üstüne gelince gösteriliyor
      marker.bindTooltip(row.name, { direction: "top", offset: [0, -8] });
      const source = row.rent?.sources[0];
      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;font-size:13px;min-width:200px">
           <div style="font-weight:600;margin-bottom:4px">${row.name}</div>
           <div>Kira (${row.areaM2} m²): <b>${
             row.estimatedRent !== null ? formatTRY(row.estimatedRent) : "veri yok"
           }</b></div>
           <div>Yaşam maliyeti: <b>${
             row.estimatedCost !== null ? formatTRY(row.estimatedCost) : "veri yok"
           }</b></div>
           ${
             source
               ? `<div style="margin-top:4px;color:#898781;font-size:11px">Kaynak: ${source.source}</div>`
               : ""
           }
         </div>`,
      );
      marker.on("click", () => onSelectRef.current(row.slug));
      marker.addTo(layer);
      points.push([row.lat, row.lng]);
    }

    // İstanbul batıda Çatalca'ya, doğuda Şile'ye kadar uzanıyor - sabit bir
    // görünüm uç ilçeleri kırpıyor, o yüzden işaretçilere göre sığdırılıyor
    if (points.length > 0 && !didFitRef.current) {
      mapRef.current?.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
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
        className="mt-3 flex items-center gap-2 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span>{formatTRY(range.min)}</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {RAMP.map((color) => (
            <span key={color} className="flex-1" style={{ background: color }} />
          ))}
        </div>
        <span>{formatTRY(range.max)}</span>
      </div>
    </div>
  );
}
