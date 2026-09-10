"""
Raylı sistem ağını kurar: her hattın istasyonlarını sıraya dizer.

Neden gerekli: elimizde istasyonların konumu var ama hangi sırayla geldikleri
yok. "Kaç durak, nereden aktarma" hesabı ancak bu sıralamayla mümkün.

Nasıl: hattın en uzak iki istasyonu uçlarıdır; birinden başlayıp her adımda en
yakın istasyona geçilerek zincir kurulur. Metro/tramvay hatları çizgisel
olduğu için bu yöntem doğru sonuç veriyor - M4, Marmaray ve T1'in çıktısı
gerçek hat sıralamasıyla birebir uyuşuyor.

DENENİP BIRAKILAN YÖNTEM: İBB'nin hat geometrisine izdüşüm. Geometri çok
parçalı (MultiLineString) ve parçalar coğrafi sırada değil; parçaları uç uca
zincirlemek de hatalı sonuç verdi (M4'te ardışık duraklar arası 13 km).

BİLİNEN SINIR: Şubeli hatlarda (M2'nin Seyrantepe şubesi) zincir şubeye
atlarken anormal bir boşluk oluşur. Bu boşluklar tespit edilip `branchGaps`
altında raporlanır - gizlenmez, çünkü o noktada sıralama güvenilir değildir.

Kullanım: python3 scripts/build_rail_network.py
Çıktı:    data/rail-network.json
"""

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "rail-network.json"

# Ardışık iki istasyon arası bu mesafeyi aşarsa sıralama şüphelidir
# (şube atlaması ya da veri boşluğu). Şehir içi raylı sistemde duraklar
# tipik olarak 0,5-2,5 km aralıkta.
GAP_WARN_KM = 4.0


def km(a: dict, b: dict) -> float:
    lat0 = math.radians((a["lat"] + b["lat"]) / 2)
    dx = (a["lng"] - b["lng"]) * 111.32 * math.cos(lat0)
    dy = (a["lat"] - b["lat"]) * 110.57
    return math.hypot(dx, dy)


def line_code(line: str, mode: str) -> str:
    match = re.match(r"^(M\d+[A-Z]?|T\d+|TF\d+|F\d+)\b", line.strip())
    if match:
        return match.group(1)
    if "marmaray" in line.lower():
        return "Marmaray"
    return mode


def order_stations(stations: list[dict]) -> list[dict]:
    """En uzak çiftin bir ucundan başlayıp en yakın komşuya zincirler."""
    if len(stations) < 3:
        return list(stations)
    start = max(
        ((x, y) for i, x in enumerate(stations) for y in stations[i + 1 :]),
        key=lambda pair: km(*pair),
    )[0]
    remaining = [s for s in stations if s is not start]
    chain = [start]
    while remaining:
        nxt = min(remaining, key=lambda s: km(chain[-1], s))
        chain.append(nxt)
        remaining.remove(nxt)
    return chain


def main() -> None:
    data = json.loads((ROOT / "data" / "transit-stations.json").read_text())
    stations = [
        s
        for src in data["sources"]
        for s in src["stations"]
        # Metrobüs de dahil: ayrılmış yolda sabit istasyonlu bir koridor,
        # rota açısından raylı sistemden farkı yok. Dışarıda bırakınca
        # Esenyurt, Beylikdüzü gibi ilçeler ağa hiç bağlanamıyordu.
        if s["stage"] == "EXISTING"
    ]

    by_line: dict[str, list[dict]] = {}
    for s in stations:
        by_line.setdefault(s["line"], []).append(s)

    lines, branch_gaps = {}, []
    for line_name, sts in sorted(by_line.items()):
        code = line_code(line_name, sts[0]["mode"])
        chain = order_stations(sts)

        entries = []
        for i, s in enumerate(chain):
            gap = 0.0 if i == 0 else round(km(chain[i - 1], s), 3)
            if gap > GAP_WARN_KM:
                branch_gaps.append(
                    {
                        "line": code,
                        "between": [chain[i - 1]["name"], s["name"]],
                        "km": gap,
                        "note": "Anormal boşluk - hattın burada şubelendiği ya da veride boşluk olduğu anlamına gelir; bu noktada sıralama güvenilir değil.",
                    }
                )
            entries.append(
                {"name": s["name"], "lat": s["lat"], "lng": s["lng"], "kmFromPrev": gap}
            )

        lines[code] = {"lineName": line_name, "mode": sts[0]["mode"], "stations": entries}

    OUT.write_text(
        json.dumps(
            {
                "_meta": {
                    "description": "Hızlı ulaşım ağı (raylı sistem + metrobüs): hat başına sıralı istasyonlar ve ardışık istasyonlar arası kuş uçuşu mesafe (km).",
                    "method": "DERIVED",
                    "source": "İBB Açık Veri - Raylı Sistem İstasyon Noktaları Verisi",
                    "sourceUrl": "https://data.ibb.gov.tr/dataset/rayli-sistem-istasyon-noktalari-verisi",
                    "producedBy": "scripts/build_rail_network.py",
                    "howOrdered": "En uzak iki istasyondan biri uç kabul edilip en yakın komşuya zincirleme. M4, Marmaray ve T1'de gerçek hat sıralamasıyla doğrulandı.",
                    "caveats": [
                        "Mesafeler kuş uçuşudur, ray boyu değil - gerçek mesafe biraz daha uzundur.",
                        "Şubeli hatlarda zincir şubeye atlarken bozulur; bu noktalar branchGaps altında listelenir.",
                        "Metrobüs koridoru dahildir; ayrılmış yolda sabit istasyonlarla çalıştığı için rota açısından raylı sistemden farksız.",
                    ],
                    "branchGaps": branch_gaps,
                },
                "lines": lines,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )

    total = sum(len(v["stations"]) for v in lines.values())
    print(f"{len(lines)} hat, {total} istasyon sıraya dizildi -> {OUT.relative_to(ROOT)}")
    if branch_gaps:
        print(f"  {len(branch_gaps)} şüpheli boşluk:")
        for g in branch_gaps:
            print(f"    {g['line']}: {g['between'][0]} → {g['between'][1]} ({g['km']} km)")


if __name__ == "__main__":
    main()
