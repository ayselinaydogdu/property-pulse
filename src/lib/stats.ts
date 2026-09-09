/** Küçük istatistik yardımcıları - aggregasyon ve outlier filtresi burada. */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Tukey çit yöntemiyle aykırı değer temizliği: [Q1 - k*IQR, Q3 + k*IQR] dışı atılır.
 * Emlak ilanlarında hem "0 TL / bilgi için arayınız" hem de yanlış girilmiş
 * astronomik fiyatlar olduğu için ortalama yerine bu filtre + medyan kullanılıyor.
 */
export function iqrFilter<T>(rows: T[], valueOf: (row: T) => number, k = 1.5): T[] {
  if (rows.length < 4) return rows;
  const sorted = rows.map(valueOf).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - k * iqr;
  const upper = q3 + k * iqr;
  return rows.filter((row) => {
    const v = valueOf(row);
    return v >= lower && v <= upper;
  });
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
