"""
İlçe bazlı otobüs hizmet yoğunluğunu İETT GTFS verisinden üretir.

Neden durak sayısı değil de sefer sıklığı: İstanbul'un her ilçesinde otobüs
durağı var, saymak ilçeleri ayırmaz. Ayırt eden şey o duraklara günde kaç
otobüs uğradığı - aynı sayıda durağı olan iki ilçeden birinde günde 400,
diğerinde 3.000 sefer olabilir.

Metrobüs (34 hat ailesi) buraya DAHİL DEĞİL: hızlı ulaşım katmanında zaten
sayılıyor, iki kere saymamak için çıkarıldı.

Kullanım:
    python3 scripts/build_bus_service.py            # önbellek varsa kullanır
    python3 scripts/build_bus_service.py --refresh  # GTFS'i yeniden indirir

Çıktı: data/bus-service.json
"""

import csv
import json
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".gtfs-cache"
OUT = ROOT / "data" / "bus-service.json"

DATASET_URL = "https://data.ibb.gov.tr/dataset/iett-gtfs-verisi"
BASE = "https://data.ibb.gov.tr/dataset/8540e256-6df5-4719-85bc-e64e91508ede/resource"
FILES = {
    "routes.csv": f"{BASE}/46dbe388-c8c2-45c4-ac72-c06953de56a2/download/routes.csv",
    "trips.csv": f"{BASE}/7ff49bdd-b0d2-4a6e-9392-b598f77f5070/download/trips.csv",
    "stops.csv": f"{BASE}/2299bc82-983b-4bdf-8520-5cef8c555e29/download/stops.csv",
    "stop_times.zip": f"{BASE}/80401c1c-c240-4a32-8f40-ef697100a681/download/stop_times.zip",
}

# Metrobüs hatları - hızlı ulaşım katmanında sayıldığı için buradan çıkarılıyor
METROBUS_LINES = {"34", "34A", "34AS", "34B", "34BZ", "34C", "34G", "34T", "34U", "34Z"}
WEEKDAY_SERVICE_ID = "0"  # calendar.csv: 0 = WEEKDAYS
ISTANBUL_BBOX = (40.7, 41.7, 27.8, 30.0)  # lat_min, lat_max, lng_min, lng_max


def download(refresh: bool = False) -> None:
    CACHE.mkdir(exist_ok=True)
    for name, url in FILES.items():
        target = CACHE / name
        if target.exists() and not refresh:
            continue
        print(f"  indiriliyor: {name}")
        urllib.request.urlretrieve(url, target)
    st = CACHE / "stop_times.txt"
    if not st.exists() or refresh:
        with zipfile.ZipFile(CACHE / "stop_times.zip") as z:
            z.extractall(CACHE)


def fix_coord(value: str) -> float | None:
    """
    Kaynak koordinatları Türkçe sayı biçimlendirmesiyle bozulmuş geliyor:
    '410.191.700.005.564' -> 41.0191700005564
    Ondalık ayracı binlik ayracına çevrilmiş; rakamlar birleştirilip ilk iki
    basamaktan sonra ondalık geri konuyor (İstanbul: enlem 40-41, boylam 27-30).
    """
    digits = re.sub(r"\D", "", value or "")
    if len(digits) < 3:
        return None
    return int(digits) / (10 ** (len(digits) - 2))


def read_rows(path: Path, delimiter: str = ";"):
    # utf-8-sig: dosya başındaki BOM ilk sütun adını bozmasın
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        yield from csv.DictReader(f, delimiter=delimiter)


def point_in_ring(lng: float, lat: float, ring: list) -> bool:
    """Işın atma yöntemiyle nokta-poligon testi."""
    inside = False
    n = len(ring)
    for i in range(n):
        j = (i - 1) % n
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
    return inside


def main() -> None:
    refresh = "--refresh" in sys.argv
    print("GTFS hazırlanıyor…")
    download(refresh)

    # 1) Metrobüs dışındaki otobüs hatları
    metrobus_routes, bus_routes = set(), {}
    for r in read_rows(CACHE / "routes.csv"):
        short = (r.get("route_short_name") or "").strip()
        if short in METROBUS_LINES:
            metrobus_routes.add(r["route_id"])
        else:
            bus_routes[r["route_id"]] = short
    print(f"  {len(bus_routes)} otobüs hattı, {len(metrobus_routes)} metrobüs hattı ayrıldı")

    # 2) Hafta içi seferler
    trip_route = {}
    for r in read_rows(CACHE / "trips.csv"):
        if r.get("service_id") != WEEKDAY_SERVICE_ID:
            continue
        route_id = r.get("route_id")
        if route_id in bus_routes:
            trip_route[r["trip_id"]] = route_id
    print(f"  {len(trip_route)} hafta içi otobüs seferi")

    # 3) Durak başına kalkış sayısı ve hizmet veren hatlar (tek geçiş, büyük dosya)
    departures = defaultdict(int)
    stop_routes = defaultdict(set)
    with (CACHE / "stop_times.txt").open(newline="", encoding="utf-8-sig", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=","):
            route_id = trip_route.get(row.get("trip_id"))
            if route_id is None:
                continue
            stop_id = row.get("stop_id")
            departures[stop_id] += 1
            stop_routes[stop_id].add(route_id)
    print(f"  {len(departures)} durakta hafta içi hizmet var")

    # 4) Durakları ilçelere dağıt
    boundaries = json.loads((ROOT / "data" / "district-boundaries.json").read_text())["boundaries"]
    lat_min, lat_max, lng_min, lng_max = ISTANBUL_BBOX

    per_district = defaultdict(lambda: {"stops": 0, "departures": 0, "routes": set()})
    unmatched = bad_coord = 0
    for r in read_rows(CACHE / "stops.csv"):
        stop_id = r.get("stop_id")
        if stop_id not in departures:
            continue
        lat, lng = fix_coord(r.get("stop_lat")), fix_coord(r.get("stop_lon"))
        if lat is None or lng is None or not (lat_min <= lat <= lat_max and lng_min <= lng <= lng_max):
            bad_coord += 1
            continue
        slug = next(
            (s for s, polys in boundaries.items() if any(point_in_ring(lng, lat, ring) for ring in polys)),
            None,
        )
        if slug is None:
            unmatched += 1
            continue
        d = per_district[slug]
        d["stops"] += 1
        d["departures"] += departures[stop_id]
        d["routes"].update(stop_routes[stop_id])

    print(f"  koordinatı bozuk/sınır dışı: {bad_coord}, ilçeye düşmeyen: {unmatched}")

    districts = {
        slug: {
            "stops": v["stops"],
            "lines": len(v["routes"]),
            "weekdayDepartures": v["departures"],
            # Boyuttan bağımsız sıklık göstergesi: ortalama bir durağa günde kaç otobüs uğruyor
            "departuresPerStop": round(v["departures"] / v["stops"], 1) if v["stops"] else 0,
        }
        for slug, v in sorted(per_district.items())
    }

    OUT.write_text(
        json.dumps(
            {
                "_meta": {
                    "description": "İlçe bazlı otobüs hizmet yoğunluğu (hafta içi). Metrobüs DAHİL DEĞİL - hızlı ulaşım katmanında sayılıyor.",
                    "source": "İBB Açık Veri - IETT GTFS Data",
                    "sourceUrl": DATASET_URL,
                    "method": "DERIVED",
                    "publishedAt": "2026-04-21",
                    "retrievedAt": "2026-09-10",
                    "producedBy": "scripts/build_bus_service.py",
                    "caveats": [
                        "departuresPerStop, ortalama bir durağa hafta içi günde uğrayan otobüs sayısıdır; ilçe büyüklüğünden bağımsızdır.",
                        "Çok hatlı aktarma durakları bu sayıyı yukarı çeker.",
                        "Sefer sıklığı, otobüsün gitmek istediğin yere gidip gitmediğini ölçmez.",
                        "Koordinatlar kaynakta bozuk geliyor, onarılıp İstanbul sınır kutusuyla doğrulandı.",
                    ],
                },
                "districts": districts,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(f"\n{len(districts)} ilçe yazıldı -> {OUT.relative_to(ROOT)}")
    top = sorted(districts.items(), key=lambda kv: -kv[1]["departuresPerStop"])
    for slug, v in top[:3] + top[-3:]:
        print(f"  {slug:16} durak {v['stops']:4}  hat {v['lines']:4}  durak başına/gün {v['departuresPerStop']:7}")


if __name__ == "__main__":
    main()
