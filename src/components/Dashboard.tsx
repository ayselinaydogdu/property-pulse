"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AffordabilityRow, DistrictStation, Provenance } from "@/lib/aggregate";
import { RentChart } from "@/components/Charts";
import { METRIC_HINTS, METRIC_LABELS, type MapMetric } from "@/lib/map-metrics";
import ContributionForm from "@/components/ContributionForm";
import ThemeToggle from "@/components/ThemeToggle";
import { formatDepartures, formatKm, formatPct, formatTRY } from "@/lib/format";

// Leaflet window nesnesine ihtiyaç duyuyor - sunucuda render edilmemeli
const MapPanel = dynamic(() => import("@/components/MapPanel"), {
  ssr: false,
  loading: () => (
    <div
      className="h-[380px] w-full animate-pulse rounded-xl"
      style={{ background: "var(--grid)" }}
    />
  ),
});

export type DashboardInput = {
  income: number;
  areaM2: number;
  household: number;
  maxBurdenPct: number;
};

/** Kaynaktaki tür adlarının okunur karşılığı. */
const MODE_LABELS: Record<string, string> = {
  Metro: "Metro",
  Tramvay: "Tramvay",
  Banliyö: "Banliyö treni",
  Füniküler: "Füniküler",
  Teleferik: "Teleferik",
  Metrobüs: "Metrobüs",
};

const METHOD_LABELS: Record<Provenance["method"], string> = {
  OBSERVED: "gözlem",
  PUBLISHED_AGGREGATE: "yayınlanmış ortalama",
  DERIVED: "hesaplanmış",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Bir sayının nereden geldiğini rakamın yanında gösterir. */
function SourceNote({ sources }: { sources: Provenance[] }) {
  return (
    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
      {sources.map((s, i) => (
        <span key={`${s.source}-${s.observedAt}`}>
          {i > 0 && " · "}
          {s.sourceUrl ? (
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {s.source}
            </a>
          ) : (
            s.source
          )}{" "}
          ({METHOD_LABELS[s.method]}, {formatDate(s.observedAt)})
        </span>
      ))}
    </span>
  );
}

/** Rozet zaten kodu gösteriyor: "M7 Yıldız - Mahmutbey..." -> "Yıldız - Mahmutbey..." */
function stripLineCode(lineName: string, code: string): string {
  return lineName.startsWith(`${code} `) ? lineName.slice(code.length + 1) : lineName;
}

/** İstasyonları hat koduna göre gruplar; gruplar merkeze yakınlığa göre sıralanır. */
function groupByLine(stations: DistrictStation[]): [string, DistrictStation[]][] {
  const groups = new Map<string, DistrictStation[]>();
  for (const st of stations) {
    const list = groups.get(st.line);
    if (list) list.push(st);
    else groups.set(st.line, [st]);
  }
  return [...groups.entries()].sort((a, b) => a[1][0].km - b[1][0].km);
}

function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      {title && (
        <header className="mb-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

function NumberField({
  label,
  help,
  value,
  onChange,
  suffix,
  min,
  step = 1,
}: {
  label: string;
  /** Kullanıcı bu kutuya ne gireceğini ve neye yaradığını buradan anlar */
  help: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tabular w-full rounded-lg border px-3 py-2 pr-12 text-base outline-none focus:ring-2"
          style={{
            background: "var(--page)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
        {suffix && (
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {suffix}
          </span>
        )}
      </span>
      <span className="text-sm leading-snug" style={{ color: "var(--text-muted)" }}>
        {help}
      </span>
    </label>
  );
}

export default function Dashboard({
  initialRows,
  initialInput,
}: {
  initialRows: AffordabilityRow[];
  initialInput: DashboardInput;
}) {
  const [input, setInput] = useState<DashboardInput>(initialInput);
  const [rows, setRows] = useState<AffordabilityRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [metric, setMetric] = useState<MapMetric>("rent");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!input.income || input.income <= 0) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPending(true);
      const params = new URLSearchParams({
        income: String(input.income),
        areaM2: String(input.areaM2),
        household: String(input.household),
        maxBurdenPct: String(input.maxBurdenPct),
      });

      try {
        const res = await fetch(`/api/affordability?${params}`, { signal: controller.signal });
        // Sunucu hata sayfası (HTML) dönebilir - JSON.parse'ın ham hatasını
        // kullanıcıya göstermek yerine ne yapması gerektiğini söylüyoruz
        const text = await res.text();
        let body: { error?: string; neighborhoods?: AffordabilityRow[] };
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error("Sunucuya ulaşılamadı. Sayfayı yenileyip tekrar dene.");
        }
        if (!res.ok) throw new Error(body.error ?? "Hesaplama başarısız");
        setRows(body.neighborhoods ?? []);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setPending(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  // Panel açıkken Esc kapatsın
  useEffect(() => {
    if (!selectedSlug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedSlug(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedSlug]);

  const withRent = rows.filter((r) => r.estimatedRent !== null);
  const cheapest = [...withRent].sort((a, b) => a.estimatedRent! - b.estimatedRent!)[0];
  const priciest = [...withRent].sort((a, b) => b.estimatedRent! - a.estimatedRent!)[0];
  const selected = rows.find((r) => r.slug === selectedSlug) ?? null;
  const hasCostData = rows.some((r) => r.cost !== null);
  const totalStations = rows.reduce((sum, r) => sum + (r.transit?.existingStations ?? 0), 0);
  const railless = rows.filter((r) => r.transit && r.transit.existingStations === 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">PropertyPulse</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            İstanbul ilçelerini kira maliyetiyle karşılaştır. Ekrandaki her sayının
            kaynağı ve tarihi yazılıdır; kaynağı olmayan hiçbir değer gösterilmez.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div
        className="mb-6 rounded-xl border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Şu iki bilgiyi gir, her ilçede ne kadar kira ödeyeceğini ve bunun gelirinin
          ne kadarı olduğunu hesaplayalım.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Aylık net gelirin ne kadar?"
            help="Eline geçen para. Kiranın gelirinin yüzde kaçını götürdüğünü buna göre hesaplıyoruz."
            value={input.income}
            min={0}
            step={1000}
            suffix="₺"
            onChange={(v) => setInput((s) => ({ ...s, income: v }))}
          />
          <NumberField
            label="Kaç m² ev arıyorsun?"
            help="Kiralar bu büyüklüğe göre hesaplanır. Kabaca: 1+1 ≈ 55 m², 2+1 ≈ 90 m², 3+1 ≈ 120 m²."
            value={input.areaM2}
            min={20}
            step={5}
            suffix="m²"
            onChange={(v) => setInput((s) => ({ ...s, areaM2: Math.max(1, v) }))}
          />
        </div>
      </div>

      {error && (
        <p
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
        >
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card
          title="Harita"
          subtitle={
            metric === "rent"
              ? `${input.areaM2} m² için tahmini aylık kira. ${METRIC_HINTS.rent}`
              : METRIC_HINTS[metric]
          }
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(METRIC_LABELS) as MapMetric[]).map((key) => {
              const disabled = (key === "cost" || key === "total") && !hasCostData;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMetric(key)}
                  aria-pressed={metric === key}
                  title={disabled ? "Bu katman için veri kaynağı bağlanmadı" : undefined}
                  className="rounded-lg border px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    borderColor: metric === key ? "var(--series-rent)" : "var(--border)",
                    color: metric === key ? "var(--series-rent)" : "var(--text-secondary)",
                    fontWeight: metric === key ? 600 : 400,
                  }}
                >
                  {METRIC_LABELS[key]}
                </button>
              );
            })}
          </div>
          {!hasCostData && (
            <p className="mb-3" style={{ color: "var(--text-muted)" }}>
              <b>Yaşam maliyeti</b> ve <b>Toplam aylık</b> katmanları kapalı: ilçe bazlı
              günlük harcama verisi için bağlanmış bir kaynak yok. Boş harita göstermek
              yerine kapalı duruyorlar.
            </p>
          )}
          <MapPanel
            rows={rows}
            metric={metric}
            selectedSlug={selectedSlug}
            onSelect={(slug) => setSelectedSlug((cur) => (cur === slug ? null : slug))}
          />
        </Card>

        <Card
          title={`Aylık kira - ${input.areaM2} m²`}
          subtitle="Kesikli çizgi aylık gelirin."
        >
          <RentChart
            rows={rows}
            income={input.income}
            selectedSlug={selectedSlug}
            onSelect={(slug) => setSelectedSlug((cur) => (cur === slug ? null : slug))}
          />
          {cheapest && priciest && cheapest.slug !== priciest.slug && (
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {cheapest.name} ile {priciest.name} arasında aylık{" "}
              <b>{formatTRY(priciest.estimatedRent! - cheapest.estimatedRent!)}</b> fark var.
            </p>
          )}
          {/* Projenin asıl söylemek istediği şey: ucuzluğun bir bedeli var */}
          {railless.length > 0 && (
            <p
              className="mt-2 rounded-lg p-2.5 text-sm"
              style={{ background: "var(--page)", color: "var(--text-secondary)" }}
            >
              Ama ucuzluğun bedeli var:{" "}
              <b>{railless.length} ilçede hiç hızlı ulaşım istasyonu yok</b> (
              {railless
                .slice(0, 3)
                .map((r) => r.name)
                .join(", ")}
              {railless.length > 3 ? "…" : ""}). En ucuz ilçe {cheapest?.name}, en yakın
              istasyona <b>{formatKm(cheapest?.transit?.nearestStationKm ?? 0)}</b> uzakta.
            </p>
          )}
        </Card>
      </div>

      <Card
        className="mb-6"
        title="Semt karşılaştırma tablosu"
          subtitle={`${rows.length} ilçe, ucuzdan pahalıya. Detay için bir satıra tıkla.`}
        >
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="py-1.5 text-left font-medium">Semt</th>
                  <th className="py-1.5 text-right font-medium">Kira</th>
                  <th className="py-1.5 text-right font-medium">Hızlı ulaşım</th>
                  <th className="py-1.5 text-right font-medium">Yaşam maliyeti</th>
                  <th className="py-1.5 text-right font-medium">Gelirin payı</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.slug}
                    onClick={() => setSelectedSlug((cur) => (cur === row.slug ? null : row.slug))}
                    className="cursor-pointer"
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: selectedSlug === row.slug ? "var(--grid)" : undefined,
                    }}
                  >
                    <td className="py-1.5">{row.name}</td>
                    <td className="tabular py-1.5 text-right">
                      {row.estimatedRent !== null ? (
                        formatTRY(row.estimatedRent)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>veri yok</span>
                      )}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {row.transit ? (
                        row.transit.existingStations > 0 ? (
                          <>
                            {row.transit.existingStations} istasyon
                            <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>
                              {formatKm(row.transit.nearestStationKm ?? 0)}
                            </span>
                          </>
                        ) : (
                          <span
                            className="font-semibold"
                            style={{ color: "var(--status-critical)" }}
                          >
                            yok
                            <span className="ml-1.5">
                              en yakın {formatKm(row.transit.nearestStationKm ?? 0)}
                            </span>
                          </span>
                        )
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>veri yok</span>
                      )}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {row.estimatedCost !== null ? (
                        formatTRY(row.estimatedCost)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>veri yok</span>
                      )}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {row.knownBurdenPct !== null ? (
                        <>
                          {formatPct(row.knownBurdenPct, 0)}
                          {row.missing.length > 0 && (
                            <span
                              className="ml-1"
                              title={`${row.missing.join(", ")} verisi eksik - gerçek oran daha yüksek`}
                              style={{ color: "var(--text-muted)" }}
                            >
                              +
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
            <b>+</b> işareti: bu ilçede eksik gider kalemi var, gerçek oran gösterilenden
            yüksek. Bu yüzden hiçbir semt için &quot;bütçene uygun&quot; hükmü verilmiyor.
          </p>
        </Card>

      {/* Sağdan açılan detay paneli - satıra, haritaya ya da çubuğa tıklayınca */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setSelectedSlug(null)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label={`${selected.name} detayı`}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l p-5 text-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{selected.name}</h2>
                <p style={{ color: "var(--text-muted)" }}>{selected.city}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlug(null)}
                aria-label="Paneli kapat"
                className="rounded-lg border px-2 py-1"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </header>

            {selected.rent && (
              <section>
                <h3 className="font-semibold">Kira</h3>
                <dl className="mt-2 space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>m² birim kira</dt>
                    <dd className="tabular font-medium">
                      {selected.rent.hasSpread
                        ? `${selected.rent.perM2Min} - ${selected.rent.perM2Max} ₺`
                        : `${selected.rent.perM2} ₺`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>{selected.areaM2} m² için</dt>
                    <dd className="tabular font-medium">{formatTRY(selected.estimatedRent!)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>Gelirinin payı</dt>
                    <dd className="tabular font-medium">
                      {selected.knownBurdenPct !== null
                        ? formatPct(selected.knownBurdenPct, 0)
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2">
                  <SourceNote sources={selected.rent.sources} />
                </p>

                {selected.rent.index && (
                  <p
                    className="mt-3 rounded-lg p-2.5"
                    style={{ background: "var(--page)", color: "var(--text-secondary)" }}
                  >
                    Karşılaştırma: TCMB&apos;ye göre <b>İstanbul geneli</b>{" "}
                    {selected.rent.index.cityPerM2} ₺/m² ({selected.rent.index.period}).
                    {selected.rent.perM2 > selected.rent.index.cityPerM2
                      ? ` ${selected.name} şehir ortalamasının üstünde.`
                      : ` ${selected.name} şehir ortalamasının altında.`}
                    {selected.rent.index.appliedFactor !== null && (
                      <span className="block" style={{ color: "var(--text-muted)" }}>
                        Çapa {selected.rent.index.baselinePeriod} tarihliydi, bu seriyle
                        ×{selected.rent.index.appliedFactor} oranında güncellendi.
                      </span>
                    )}
                  </p>
                )}
              </section>
            )}

            {selected.transit && (
              <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <h3 className="font-semibold">
                  Hızlı ulaşım
                  {selected.transit.existingStations > 0 && (
                    <span
                      className="ml-2 font-normal"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {selected.transit.existingStations} istasyon ·{" "}
                      {selected.transit.lines.length} hat
                    </span>
                  )}
                </h3>

                {selected.transit.stations.length > 0 ? (
                  <>
                    <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                      Aşağıdakiler bu hatların <b>{selected.name} sınırları içindeki</b>{" "}
                      istasyonları. Hatlar başka ilçelerden de geçiyor.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {groupByLine(selected.transit.stations).map(([line, stations]) => (
                        <li key={line}>
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span
                              className="rounded px-1.5 py-0.5 font-semibold"
                              style={{ background: "var(--series-rent)", color: "#fcfcfb" }}
                            >
                              {line}
                            </span>
                            {(MODE_LABELS[stations[0].mode] ?? stations[0].mode) !== line && (
                              <span className="font-medium">
                                {MODE_LABELS[stations[0].mode] ?? stations[0].mode}
                              </span>
                            )}
                            <span style={{ color: "var(--text-muted)" }}>
                              {stripLineCode(stations[0].lineName, line)}
                            </span>
                          </div>
                          <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {stations.map((st) => st.name).join(" · ")}
                          </p>
                          <p style={{ color: "var(--text-muted)" }}>
                            Bu ilçede {stations.length} istasyon · hattın İstanbul genelinde{" "}
                            {stations[0].lineTotal} istasyonu var
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
                    Bu ilçede hızlı ulaşım istasyonu yok.
                  </p>
                )}

                {selected.transit.nearestStationName && (
                  <p
                    className="mt-3 rounded-lg p-2.5"
                    style={{ background: "var(--page)", color: "var(--text-secondary)" }}
                  >
                    İlçe merkezine en yakın istasyon:{" "}
                    <b>
                      {selected.transit.nearestStationName} (
                      {selected.transit.nearestStationLine})
                    </b>
                    , kuş uçuşu {formatKm(selected.transit.nearestStationKm ?? 0)}.
                    <span className="block" style={{ color: "var(--text-muted)" }}>
                      Yürüme mesafesi değildir; evin ilçenin neresinde olduğuna göre
                      değişir.
                    </span>
                  </p>
                )}

                <p className="mt-3">
                  <SourceNote sources={[selected.transit.provenance]} />
                </p>
              </section>
            )}

            {selected.bus && (
              <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <h3 className="font-semibold">
                  Otobüs
                  <span className="ml-2 font-normal" style={{ color: "var(--text-secondary)" }}>
                    39 ilçe içinde sıklıkta {selected.bus.rank}. sırada
                  </span>
                </h3>
                <dl className="mt-2 space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>
                      Bir durağa günde yapılan sefer
                    </dt>
                    <dd className="tabular font-medium">
                      {formatDepartures(selected.bus.departuresPerStop)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>Durak sayısı</dt>
                    <dd className="tabular font-medium">{selected.bus.stops}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>Hizmet veren hat</dt>
                    <dd className="tabular font-medium">{selected.bus.lines}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt style={{ color: "var(--text-muted)" }}>Hafta içi günlük kalkış</dt>
                    <dd className="tabular font-medium">
                      {selected.bus.weekdayDepartures.toLocaleString("tr-TR")}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2" style={{ color: "var(--text-muted)" }}>
                  Sayılan şey araç değil, o durağa yapılan sefer - aynı otobüs gün içinde
                  defalarca geçer. Durak sayısı ilçeleri ayırmaz, ayırt eden şey sıklık.
                  Metrobüs bu sayılara dahil değil, yukarıda ayrı sayılıyor.
                </p>
                <p className="mt-2">
                  <SourceNote sources={[selected.bus.provenance]} />
                </p>
              </section>
            )}

            <ContributionForm
              neighborhoodSlug={selected.slug}
              neighborhoodName={selected.name}
              ownRentContributions={selected.rent?.observationCount ?? 0}
            />

            {selected.missing.length > 0 && (
              <p className="mt-5" style={{ color: "var(--text-muted)" }}>
                Eksik veri: {selected.missing.join(", ")}
              </p>
            )}
          </aside>
        </>
      )}

      <Card
        className="mb-6"
        title="Veri durumu"
          subtitle="Neyin gerçek veriyle geldiği, neyin eksik olduğu"
        >
          <ul className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <li className="flex items-start gap-2">
              <span aria-hidden style={{ color: "var(--status-good)" }}>
                ●
              </span>
              <div>
                <div className="font-medium">
                  Kira (ilçe bazlı m²) · {rows.filter((r) => r.rent).length} ilçe
                </div>
                {rows[0]?.rent ? (
                  <SourceNote sources={rows[0].rent.sources} />
                ) : (
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    yüklenmedi
                  </span>
                )}
                {rows[0]?.rent?.sources[0]?.note && (
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    {rows[0].rent.sources[0].note}
                  </p>
                )}
              </div>
            </li>
            {rows[0]?.transit && (
              <li className="flex items-start gap-2">
                <span aria-hidden style={{ color: "var(--status-good)" }}>
                  ●
                </span>
                <div>
                  <div className="font-medium">
                    Hızlı ulaşım · İstanbul ilçelerinde {totalStations} mevcut istasyon
                  </div>
                  <SourceNote sources={[rows[0].transit.provenance]} />
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Metro, tramvay, banliyö (Marmaray), füniküler, teleferik ve metrobüs.
                    Metrobüs teknik olarak otobüstür ama ayrılmış yolda sabit istasyonlarla
                    çalıştığı için erişim açısından raylı sisteme denk sayıldı. Sıradan
                    otobüs durakları dahil değil: her ilçede var, ilçeleri ayırmıyor.
                    İnşaat halindeki istasyonlar sayılmıyor. Uzaklık ilçe merkezinden kuş
                    uçuşudur - yürüme mesafesi değildir.
                  </p>
                </div>
              </li>
            )}
            {rows[0]?.rent?.index && (
              <li className="flex items-start gap-2">
                <span aria-hidden style={{ color: "var(--status-good)" }}>
                  ●
                </span>
                <div>
                  <div className="font-medium">
                    TCMB kira endeksi · İstanbul geneli {rows[0].rent.index.cityPerM2} ₺/m² (
                    {rows[0].rent.index.period})
                  </div>
                  <SourceNote sources={[rows[0].rent.index.provenance]} />
                  <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                    Üç aylık, İstanbul geneli - ilçe kırılımı yok. İki işi var: bağımsız
                    çapraz kontrol, ve ilçe çapaları bayatladığında oranlanarak
                    güncellenmeleri. Güncelleme uygulanırsa değer{" "}
                    <b>ölçüm değil çıkarım</b> olarak işaretlenir.
                  </p>
                </div>
              </li>
            )}
            {rows[0]?.bus && (
              <li className="flex items-start gap-2">
                <span aria-hidden style={{ color: "var(--status-good)" }}>
                  ●
                </span>
                <div>
                  <div className="font-medium">Otobüs hizmet yoğunluğu · 39 ilçe</div>
                  <SourceNote sources={[rows[0].bus.provenance]} />
                  <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                    Hafta içi sefer verisinden hesaplandı. Durak sayısı değil{" "}
                    <b>sefer sıklığı</b> ölçülüyor: Fatih&apos;te ortalama bir durağa
                    günde ~455 sefer yapılırken Şile&apos;de ~9. Sayılan şey araç değil,
                    o durağa yapılan sefer. Metrobüs hariç.
                  </p>
                </div>
              </li>
            )}
            {[
              {
                name: "Günlük harcamalar (kahve, market, hizmet)",
                note: "İlçe kırılımında yayınlanmış veri yok. Toplama başladı: bir ilçe seç, panelden kendi fiyatlarını gir.",
              },
              {
                name: "İşe gidiş süresi",
                note: "İstasyon konumları bağlandı; kapı-kapı süre hesabı için rota motoru gerekiyor. Sıradaki iş.",
              },
              {
                name: "Satılık m² fiyatı ve kira getirisi",
                note: "İlçe bazlı gerçek kaynak bulunamadı. Kaldırıldı.",
              },
            ].map((gap) => (
              <li key={gap.name} className="flex items-start gap-2">
                <span aria-hidden style={{ color: "var(--text-muted)" }}>
                  ○
                </span>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    {gap.name}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {gap.note}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

      <footer className="text-sm" style={{ color: "var(--text-muted)" }}>
        <p>
          Kira değerleri yayınlanmış ilçe ortalamalarından alınmıştır ve seçtiğin m² ile
          çarpılarak hesaplanır - tek tek ilanlara bakılmamıştır, gerçek kiralar bu değerin
          etrafında dağılır. Kaynağı olmayan hiçbir sayı gösterilmez.
          {pending && <span> · güncelleniyor…</span>}
        </p>
      </footer>
    </main>
  );
}
