"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AffordabilityRow, Provenance } from "@/lib/aggregate";
import { RentChart } from "@/components/Charts";
import { METRIC_HINTS, METRIC_LABELS, type MapMetric } from "@/lib/map-metrics";
import ThemeToggle from "@/components/ThemeToggle";
import { formatKm, formatPct, formatTRY } from "@/lib/format";

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
              const disabled =
                (key === "cost" || key === "total") && !hasCostData;
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
              <b>{railless.length} ilçede hiç raylı sistem istasyonu yok</b> (
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

      <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card
          title="Semt karşılaştırma tablosu"
          subtitle={`${rows.length} ilçe, ucuzdan pahalıya`}
        >
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="py-1.5 text-left font-medium">Semt</th>
                  <th className="py-1.5 text-right font-medium">Kira</th>
                  <th className="py-1.5 text-right font-medium">Raylı sistem</th>
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
                            <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                              {formatKm(row.transit.nearestStationKm ?? 0)}
                            </span>
                          </>
                        ) : (
                          <span
                            className="font-semibold"
                            style={{ color: "var(--status-critical)" }}
                          >
                            yok
                            <span className="ml-1">
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

        <Card
          title="Veri durumu"
          subtitle="Neyin gerçek veriyle geldiği, neyin eksik olduğu"
        >
          <ul className="space-y-3 text-sm">
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
                    Raylı sistem · İstanbul ilçelerinde {totalStations} mevcut istasyon
                  </div>
                  <SourceNote sources={[rows[0].transit.provenance]} />
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Metro, tramvay, banliyö (Marmaray), füniküler ve teleferik. İnşaat
                    halindeki istasyonlar erişim sayısına katılmıyor. Kaynaktaki 268 mevcut
                    istasyonun 6 tanesi bir ilçe sınırına düşmüyor: 5'i Kocaeli'nde
                    (Marmaray il dışına çıkıyor), Haliç ise metro köprüsünün üstünde.
                    Uzaklık, ilçe merkezinden kuş uçuşudur - yürüme mesafesi değildir.
                  </p>
                </div>
              </li>
            )}
            {[
              {
                name: "Günlük harcamalar (kahve, market, hizmet)",
                note: "İlçe kırılımında yayınlanmış veri yok. Kullanıcı katkısıyla toplanacak.",
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
      </div>

      {selected?.rent && (
        <Card className="mb-6" title={`${selected.name} - kira verisi`}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-sm" style={{ color: "var(--text-muted)" }}>
                m² birim kira
              </dt>
              <dd className="tabular mt-0.5 font-medium">
                {selected.rent.hasSpread
                  ? `${selected.rent.perM2Min} - ${selected.rent.perM2Max} ₺`
                  : `${selected.rent.perM2} ₺`}
              </dd>
            </div>
            <div>
              <dt className="text-sm" style={{ color: "var(--text-muted)" }}>
                {selected.areaM2} m² için
              </dt>
              <dd className="tabular mt-0.5 font-medium">
                {formatTRY(selected.estimatedRent!)}
              </dd>
            </div>
            <div>
              <dt className="text-sm" style={{ color: "var(--text-muted)" }}>
                Dayanak
              </dt>
              <dd className="mt-0.5 font-medium">
                {selected.rent.basis === "OWN_OBSERVATIONS"
                  ? `${selected.rent.observationCount} kendi kaydımız`
                  : "yayınlanmış ortalama"}
              </dd>
            </div>
            <div>
              <dt className="text-sm" style={{ color: "var(--text-muted)" }}>
                Eksik veri
              </dt>
              <dd className="mt-0.5 font-medium">
                {selected.missing.length > 0 ? selected.missing.join(", ") : "yok"}
              </dd>
            </div>
          </dl>
          <p className="mt-3">
            <SourceNote sources={selected.rent.sources} />
          </p>
        </Card>
      )}

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
