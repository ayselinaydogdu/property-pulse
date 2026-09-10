"""
TCMB EVDS'den İstanbul konut birim kirası serisini çeker.

Ne işe yarıyor: data/rent-benchmarks.json'daki ilçe kira çapaları elle
girildiği için zamanla bayatlar. TCMB'nin TP.BK.ISTANBUL serisi İstanbul
geneli birim kirayı (TL/m²) üç aylık yayımlıyor; çapa bayatladığında bu
seriyle oranlanarak güncellenebilir:

    güncel_kira = çapa_kirası × (bugünkü_endeks / çapa_tarihindeki_endeks)

Bu bir ÖLÇÜM DEĞİL ÇIKARIMDIR; veritabanına method=DERIVED olarak yazılır.

Ayrıca serinin son değeri arayüzde bağımsız bir çapraz kontrol olarak
gösterilir: "TCMB'ye göre İstanbul geneli 442,57 TL/m² (2026-Q2)".

API anahtarı .env dosyasındaki EVDS_API_KEY'den okunur (git'e girmez).

Kullanım: python3 scripts/fetch_evds_rent_index.py
Çıktı:    data/rent-index.json
"""

import json
import re
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "rent-index.json"

BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis"
SERIES = "TP.BK.ISTANBUL"
SERIES_NAME = "İstanbul Konut Birim Kiraları"
DATAGROUP = "bie_bk"
START = "01-01-2015"


def read_api_key() -> str:
    env = (ROOT / ".env").read_text(encoding="utf-8")
    match = re.search(r'^EVDS_API_KEY\s*=\s*"?([^"\n]+)"?', env, re.MULTILINE)
    if not match:
        raise SystemExit(".env içinde EVDS_API_KEY yok. EVDS profil sayfasından alınabilir.")
    return match.group(1).strip()


def quarter_start(label: str) -> str:
    """'2026-Q2' -> '2026-04-01' (çeyreğin ilk günü)."""
    year, q = label.split("-Q")
    return f"{year}-{(int(q) - 1) * 3 + 1:02d}-01"


def main() -> None:
    key = read_api_key()
    today = date.today().strftime("%d-%m-%Y")
    url = f"{BASE}/series={SERIES}&startDate={START}&endDate={today}&type=json"

    request = urllib.request.Request(url, headers={"key": key})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as err:
        raise SystemExit(f"EVDS isteği başarısız: HTTP {err.code}") from err

    field = SERIES.replace(".", "_")
    points = []
    for item in payload.get("items", []):
        value = item.get(field)
        label = item.get("Tarih")
        # Henüz yayımlanmamış çeyrekler boş geliyor - atlanır, sıfır sayılmaz
        if not value or not label:
            continue
        points.append(
            {"period": label, "periodStart": quarter_start(label), "value": round(float(value), 2)}
        )

    if not points:
        raise SystemExit("Seri boş döndü - seri kodu veya tarih aralığı hatalı olabilir.")

    points.sort(key=lambda p: p["periodStart"])

    OUT.write_text(
        json.dumps(
            {
                "_meta": {
                    "description": "TCMB İstanbul konut birim kirası (TL/m², üç aylık). İlçe çapaları bayatladığında bu seriyle oranlanarak güncellenir; sonuç method=DERIVED olarak işaretlenir.",
                    "series": SERIES,
                    "seriesName": SERIES_NAME,
                    "datagroup": DATAGROUP,
                    "unit": "TL/m²",
                    "frequency": "üç aylık",
                    "source": "TCMB EVDS",
                    "sourceUrl": "https://evds3.tcmb.gov.tr",
                    "method": "OBSERVED",
                    "retrievedAt": date.today().isoformat(),
                    "producedBy": "scripts/fetch_evds_rent_index.py",
                    "caveats": [
                        "İstanbul GENELİ bir ortalamadır; ilçe kırılımı yoktur.",
                        "Değerleme raporlarına dayanır, ilan veya kiracı beyanına değil - seviyesi başka kaynaklardan farklı olabilir. Bu yüzden seviye için değil, ZAMAN İÇİNDEKİ DEĞİŞİM için kullanılır.",
                        "Son çeyrek gecikmeli yayımlanır; henüz yayımlanmamış çeyrekler atlanır.",
                    ],
                },
                "points": points,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )

    first, last = points[0], points[-1]
    print(f"{len(points)} çeyrek yazıldı -> {OUT.relative_to(ROOT)}")
    print(f"  ilk : {first['period']}  {first['value']} TL/m²")
    print(f"  son : {last['period']}  {last['value']} TL/m²")
    if len(points) >= 5:
        yoy = (last["value"] / points[-5]["value"] - 1) * 100
        print(f"  yıllık değişim: %{yoy:.1f}")


if __name__ == "__main__":
    main()
