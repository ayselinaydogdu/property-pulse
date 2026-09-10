"use client";

import { useEffect, useState } from "react";
import { LIMITS } from "@/lib/contributions";

type Item = {
  slug: string;
  name: string;
  unit: string;
  scope: "CITY" | "DISTRICT";
  monthlyQtyAssumption: number;
  contributions: number;
};

const inputStyle = {
  background: "var(--page)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
} as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Kullanıcıların kendi kirasını ve gündelik fiyatları girdiği form.
 *
 * Bu iki veri hiçbir açık kaynakta yok; projenin tek doldurma yolu bu.
 * Kira katkıları eşiği geçince ilçenin ortalaması yayınlanmış çapa yerine
 * kendi kayıtlarımızın medyanından hesaplanmaya başlar.
 */
export default function ContributionForm({
  neighborhoodSlug,
  neighborhoodName,
  ownRentContributions,
}: {
  neighborhoodSlug: string;
  neighborhoodName: string;
  ownRentContributions: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<"rent" | "price">("rent");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [areaM2, setAreaM2] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [rooms, setRooms] = useState("");
  const [itemSlug, setItemSlug] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    fetch("/api/contributions")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setItemSlug((cur) => cur || (d.items?.[0]?.slug ?? ""));
      })
      .catch(() => setItems([]));
  }, []);

  // İlçe değişince önceki gönderimin sonucu ekranda kalmasın
  useEffect(() => {
    setResult(null);
  }, [neighborhoodSlug]);

  async function submit(payload: Record<string, unknown>) {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: body.error ?? "Gönderilemedi" });
        return;
      }
      setResult({ ok: true, text: body.message ?? "Teşekkürler, kaydedildi." });
      setAreaM2("");
      setMonthlyRent("");
      setRooms("");
      setPrice("");
    } catch {
      setResult({ ok: false, text: "Sunucuya ulaşılamadı." });
    } finally {
      setPending(false);
    }
  }

  const selectedItem = items.find((i) => i.slug === itemSlug);
  const kalan = Math.max(0, 20 - ownRentContributions);

  return (
    <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="font-semibold">Veri ekle</h3>
      <p className="mt-1" style={{ color: "var(--text-muted)" }}>
        Kendi kiran ve gündelik fiyatlar hiçbir açık kaynakta yok. Girersen herkes
        görür.
      </p>

      <div className="mt-3 flex gap-1.5">
        {(["rent", "price"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setResult(null);
            }}
            aria-pressed={tab === key}
            className="rounded-lg border px-2.5 py-1"
            style={{
              borderColor: tab === key ? "var(--series-rent)" : "var(--border)",
              color: tab === key ? "var(--series-rent)" : "var(--text-secondary)",
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            {key === "rent" ? "Kiram" : "Bir fiyat"}
          </button>
        ))}
      </div>

      {tab === "rent" ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit({
              kind: "rent",
              neighborhoodSlug,
              areaM2: Number(areaM2),
              monthlyRent: Number(monthlyRent),
              rooms: rooms || null,
            });
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <Field label="Kaç m²">
              <input
                type="number"
                required
                min={LIMITS.areaM2.min}
                max={LIMITS.areaM2.max}
                value={areaM2}
                onChange={(e) => setAreaM2(e.target.value)}
                className="tabular w-full rounded-lg border px-2 py-1.5"
                style={inputStyle}
              />
            </Field>
            <Field label="Aylık kira ₺">
              <input
                type="number"
                required
                min={LIMITS.monthlyRent.min}
                max={LIMITS.monthlyRent.max}
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="tabular w-full rounded-lg border px-2 py-1.5"
                style={inputStyle}
              />
            </Field>
            <Field label="Oda (isteğe bağlı)">
              <input
                type="text"
                placeholder="2+1"
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
                className="w-full rounded-lg border px-2 py-1.5"
                style={inputStyle}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
            style={{ background: "var(--series-rent)", color: "#fcfcfb" }}
          >
            {pending ? "Gönderiliyor…" : `${neighborhoodName} için gönder`}
          </button>
          <p style={{ color: "var(--text-muted)" }}>
            {ownRentContributions} katkı var.{" "}
            {kalan > 0
              ? `${kalan} tane daha gelince bu ilçenin kirası yayınlanmış ortalama yerine kendi kayıtlarımızdan hesaplanacak.`
              : "Bu ilçenin kirası artık kendi kayıtlarımızdan hesaplanıyor."}
          </p>
        </form>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit({
              kind: "price",
              itemSlug,
              neighborhoodSlug: selectedItem?.scope === "DISTRICT" ? neighborhoodSlug : null,
              price: Number(price),
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ne">
              <select
                value={itemSlug}
                onChange={(e) => setItemSlug(e.target.value)}
                className="w-full rounded-lg border px-2 py-1.5"
                style={inputStyle}
              >
                {items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Fiyat ₺ / ${selectedItem?.unit ?? "birim"}`}>
              <input
                type="number"
                required
                min={LIMITS.itemPrice.min}
                max={LIMITS.itemPrice.max}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="tabular w-full rounded-lg border px-2 py-1.5"
                style={inputStyle}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending || !itemSlug}
            className="rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
            style={{ background: "var(--series-rent)", color: "#fcfcfb" }}
          >
            {pending ? "Gönderiliyor…" : "Gönder"}
          </button>
          {selectedItem && (
            <p style={{ color: "var(--text-muted)" }}>
              {selectedItem.scope === "CITY"
                ? "Bu kalem ilçeye göre değişmiyor, fiyat şehrin tamamı için kaydedilir."
                : `Bu fiyat ${neighborhoodName} için kaydedilir.`}{" "}
              Şu ana kadar {selectedItem.contributions} katkı.
            </p>
          )}
        </form>
      )}

      {result && (
        <p
          className="mt-2 rounded-lg p-2.5"
          style={{
            background: "var(--page)",
            color: result.ok ? "var(--status-good)" : "var(--status-critical)",
          }}
        >
          {result.text}
        </p>
      )}
    </section>
  );
}
