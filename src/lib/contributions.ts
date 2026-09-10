/**
 * Kullanıcı katkılarının doğrulama kuralları.
 *
 * Bu sınırlar veri değil, yazım hatası ve kötüye kullanıma karşı korkuluktur.
 * Sınırların içinde kalan aykırı değerler ayrıca IQR filtresiyle elenir ve bir
 * ilçenin ortalaması kendi kayıtlarımızdan hesaplanmadan önce en az
 * MIN_OWN_OBSERVATIONS kadar kayıt beklenir.
 */

export const LIMITS = {
  areaM2: { min: 15, max: 500 },
  monthlyRent: { min: 1_000, max: 1_000_000 },
  itemPrice: { min: 1, max: 100_000 },
} as const;

export type RentContribution = {
  kind: "rent";
  neighborhoodSlug: string;
  areaM2: number;
  monthlyRent: number;
  rooms?: string | null;
  /** Mahalle/semt - ilçe içindeki farkı zamanla görebilmek için */
  subArea?: string | null;
};

export type PriceContribution = {
  kind: "price";
  itemSlug: string;
  /** scope=CITY kalemlerde boş bırakılır */
  neighborhoodSlug?: string | null;
  price: number;
};

export type Contribution = RentContribution | PriceContribution;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

/** Gövdeyi doğrular; hata varsa kullanıcıya gösterilecek Türkçe mesaj döner. */
export function parseContribution(body: unknown): { ok: true; value: Contribution } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek gövdesi" };
  }
  const data = body as Record<string, unknown>;

  if (data.kind === "rent") {
    const { neighborhoodSlug, areaM2, monthlyRent, rooms, subArea } = data;
    if (typeof neighborhoodSlug !== "string" || !neighborhoodSlug) {
      return { ok: false, error: "İlçe seçilmedi" };
    }
    if (!isFiniteNumber(areaM2) || !inRange(areaM2, LIMITS.areaM2)) {
      return {
        ok: false,
        error: `Daire büyüklüğü ${LIMITS.areaM2.min}-${LIMITS.areaM2.max} m² arasında olmalı`,
      };
    }
    if (!isFiniteNumber(monthlyRent) || !inRange(monthlyRent, LIMITS.monthlyRent)) {
      return {
        ok: false,
        error: `Aylık kira ${LIMITS.monthlyRent.min.toLocaleString("tr-TR")}-${LIMITS.monthlyRent.max.toLocaleString("tr-TR")} ₺ arasında olmalı`,
      };
    }
    return {
      ok: true,
      value: {
        kind: "rent",
        neighborhoodSlug,
        areaM2: Math.round(areaM2),
        monthlyRent: Math.round(monthlyRent),
        rooms: typeof rooms === "string" && rooms.trim() ? rooms.trim().slice(0, 10) : null,
        subArea:
          typeof subArea === "string" && subArea.trim() ? subArea.trim().slice(0, 60) : null,
      },
    };
  }

  if (data.kind === "price") {
    const { itemSlug, neighborhoodSlug, price } = data;
    if (typeof itemSlug !== "string" || !itemSlug) {
      return { ok: false, error: "Kalem seçilmedi" };
    }
    if (!isFiniteNumber(price) || !inRange(price, LIMITS.itemPrice)) {
      return {
        ok: false,
        error: `Fiyat ${LIMITS.itemPrice.min}-${LIMITS.itemPrice.max.toLocaleString("tr-TR")} ₺ arasında olmalı`,
      };
    }
    return {
      ok: true,
      value: {
        kind: "price",
        itemSlug,
        neighborhoodSlug:
          typeof neighborhoodSlug === "string" && neighborhoodSlug ? neighborhoodSlug : null,
        price,
      },
    };
  }

  return { ok: false, error: "Bilinmeyen katkı türü" };
}
