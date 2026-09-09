"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AffordabilityRow } from "@/lib/aggregate";
import { formatShortTRY, formatTRY } from "@/lib/format";

const AXIS = { fill: "var(--text-muted)", fontSize: 12 };

type Datum = {
  slug: string;
  name: string;
  kira: number;
  rangeLabel: string | null;
};

function RentTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: Datum }[];
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-sm"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mb-1 font-medium">{d.name}</div>
      <div className="tabular">{formatTRY(d.kira)}/ay</div>
      {d.rangeLabel && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Kaynaklar farklı: {d.rangeLabel}
        </div>
      )}
    </div>
  );
}

/**
 * Semt bazlı tahmini aylık kira. Tek seri olduğu için lejant yok - başlık seriyi
 * adlandırıyor. Kira verisi olmayan semtler grafikte yer almaz, listede
 * "veri yok" olarak görünür.
 */
export function RentChart({
  rows,
  income,
  limit = 12,
  onSelect,
  selectedSlug,
}: {
  rows: AffordabilityRow[];
  income: number;
  /** 39 ilçenin hepsi tek grafiğe sığmaz - en ucuzdan bu kadarı gösterilir */
  limit?: number;
  onSelect?: (slug: string) => void;
  selectedSlug?: string | null;
}) {
  const withRent = rows.filter((r) => r.estimatedRent !== null);
  const data: Datum[] = [...withRent]
    .sort((a, b) => a.estimatedRent! - b.estimatedRent!)
    .slice(0, limit)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      kira: r.estimatedRent!,
      rangeLabel:
        r.rent?.hasSpread && r.estimatedRentMin !== null && r.estimatedRentMax !== null
          ? `${formatTRY(r.estimatedRentMin)} - ${formatTRY(r.estimatedRentMax)}`
          : null,
    }));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Kira verisi yok.
      </p>
    );
  }

  return (
    <>
      {withRent.length > data.length && (
        <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {withRent.length} ilçenin en ucuz {data.length} tanesi. Tamamı aşağıdaki tabloda.
        </p>
      )}
      <ResponsiveContainer width="100%" height={44 * data.length + 96}>
      <BarChart data={data} layout="vertical" margin={{ top: 20, right: 84, bottom: 8, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis
          type="number"
          tickFormatter={formatShortTRY}
          tick={AXIS}
          axisLine={{ stroke: "var(--axis)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={84}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<RentTooltip />} cursor={{ fill: "var(--grid)", fillOpacity: 0.4 }} />
        {income > 0 && (
          <ReferenceLine
            x={income}
            stroke="var(--text-muted)"
            strokeDasharray="4 4"
            label={{
              value: "Gelirin",
              position: "top",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
        )}
        <Bar
          dataKey="kira"
          name="Aylık kira"
          className="pp-bar-rent"
          fill="var(--series-rent)"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          onClick={(entry) => {
            const slug = (entry as unknown as { payload?: Datum })?.payload?.slug;
            if (slug) onSelect?.(slug);
          }}
        >
          {data.map((d) => (
            <Cell
              key={d.slug}
              fillOpacity={!selectedSlug || selectedSlug === d.slug ? 1 : 0.35}
              cursor={onSelect ? "pointer" : undefined}
            />
          ))}
          <LabelList
            dataKey="kira"
            position="right"
            formatter={(v) => formatShortTRY(Number(v))}
            style={{ fill: "var(--text-secondary)", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
      </ResponsiveContainer>
    </>
  );
}
