/** Coğrafi yardımcılar. */

const EARTH_RADIUS_KM = 6371;

/** İki nokta arasındaki kuş uçuşu mesafe (km). Yürüme/yolculuk mesafesi DEĞİLDİR. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Işın atma (ray casting) ile nokta-poligon testi.
 *
 * Bir istasyonun/durağın hangi ilçeye düştüğünü bulmak için kullanılıyor.
 * `ring`, GeoJSON sırasıyla [lng, lat] çiftlerinden oluşur.
 */
export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
