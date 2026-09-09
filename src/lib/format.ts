const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const tlPrecise = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** 37500 -> "37.500 ₺" */
export function formatTRY(value: number): string {
  return `${tl.format(Math.round(value))} ₺`;
}

/** Eksen etiketleri için kısa biçim: 37500 -> "37,5B" */
export function formatShortTRY(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${tlPrecise.format(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `${tlPrecise.format(value / 1_000)}B`;
  return tl.format(value);
}

export function formatPct(value: number, digits = 1): string {
  return `%${value.toFixed(digits).replace(".", ",")}`;
}
