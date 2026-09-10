/**
 * Kira ile işe yakınlık arasındaki ödünleşim.
 *
 * İki büyüklük farklı birimde: lira ve durak. Tek bir puana indirmek "bir
 * durak kaç lira eder" diye bir katsayı uydurmayı gerektirir - bu katsayı
 * kişiden kişiye değişir ve bizim bilebileceğimiz bir şey değildir.
 *
 * Onun yerine BASKINLIK kullanılıyor: bir ilçe, kendisinden hem daha ucuz hem
 * daha yakın başka bir ilçe varsa elenir. Elenmeyenler ("Pareto sınırı")
 * gerçek seçeneklerdir; aralarındaki tercih kullanıcının önceliğine kalır.
 */

export type TradeoffItem = {
  slug: string;
  /** Aylık kira, TL */
  rent: number;
  /** İşe kaç durak */
  stops: number;
};

/**
 * Baskılanmamış seçenekleri döner: hiçbir ilçe onlardan hem daha ucuz hem
 * daha yakın değildir.
 *
 * Eşit değerli ilçelerde (aynı kira, aynı durak) ikisi de kalır - biri
 * diğerini kesin olarak yenmiyor.
 */
export function paretoOptimal(items: TradeoffItem[]): Set<string> {
  const kept = new Set<string>();
  for (const a of items) {
    const dominated = items.some(
      (b) =>
        b.slug !== a.slug &&
        b.rent <= a.rent &&
        b.stops <= a.stops &&
        (b.rent < a.rent || b.stops < a.stops),
    );
    if (!dominated) kept.add(a.slug);
  }
  return kept;
}
