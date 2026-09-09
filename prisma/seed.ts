/**
 * data/ altındaki dosyaları veritabanına yükler.
 *
 * Buraya SADECE kaynağı belli veri girer. Bir sayının kaynağı ve tarihi yoksa
 * veritabanına giremez - şema da buna izin vermez (source/sourceUrl zorunlu).
 */
import { PrismaClient, type SourceMethod, type StationStage } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(process.cwd(), ...segments), "utf8")) as T;
}

type NeighborhoodFile = {
  neighborhoods: {
    slug: string;
    name: string;
    district: string;
    city: string;
    lat: number;
    lng: number;
  }[];
};

type BoundaryFile = {
  boundaries: Record<string, number[][][]>;
};

type StationFile = {
  sources: {
    name: string;
    url: string;
    method: SourceMethod;
    retrievedAt: string;
    stations: {
      name: string;
      line: string;
      mode: string;
      stage: StationStage;
      lat: number;
      lng: number;
    }[];
  }[];
};

type BenchmarkFile = {
  sources: {
    key: string;
    name: string;
    url: string;
    method: SourceMethod;
    retrievedAt: string;
    periodNote?: string;
    sampleNote?: string;
    benchmarks: { neighborhoodSlug: string; rentPerM2: number; sampleSize?: number }[];
  }[];
};

/**
 * Işın atma (ray casting) ile nokta-poligon testi.
 * Bir istasyonun hangi ilçeye düştüğünü bulmak için kullanılıyor.
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
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

async function main() {
  const { neighborhoods } = readJson<NeighborhoodFile>("data", "neighborhoods.json");
  const { sources } = readJson<BenchmarkFile>("data", "rent-benchmarks.json");
  const { boundaries } = readJson<BoundaryFile>("data", "district-boundaries.json");

  const idBySlug = new Map<string, number>();
  let withPolygon = 0;
  for (const n of neighborhoods) {
    const polygon = boundaries[n.slug] ?? null;
    if (polygon) withPolygon++;
    const row = await prisma.neighborhood.upsert({
      where: { slug: n.slug },
      update: {
        name: n.name,
        district: n.district,
        city: n.city,
        lat: n.lat,
        lng: n.lng,
        polygon,
      },
      create: { ...n, polygon },
    });
    idBySlug.set(n.slug, row.id);
  }
  console.log(`${neighborhoods.length} semt yüklendi (${withPolygon} tanesi sınır çokgeniyle)`);

  let benchmarkCount = 0;
  for (const source of sources) {
    const retrievedAt = new Date(source.retrievedAt);
    const note = [source.periodNote, source.sampleNote].filter(Boolean).join(" ") || null;

    for (const b of source.benchmarks) {
      const neighborhoodId = idBySlug.get(b.neighborhoodSlug);
      if (!neighborhoodId) {
        throw new Error(`rent-benchmarks.json bilinmeyen semt: ${b.neighborhoodSlug}`);
      }
      await prisma.rentBenchmark.upsert({
        where: {
          neighborhoodId_source_retrievedAt: {
            neighborhoodId,
            source: source.name,
            retrievedAt,
          },
        },
        update: { rentPerM2: b.rentPerM2, sampleSize: b.sampleSize ?? null, note },
        create: {
          neighborhoodId,
          rentPerM2: b.rentPerM2,
          sampleSize: b.sampleSize ?? null,
          method: source.method,
          source: source.name,
          sourceUrl: source.url,
          retrievedAt,
          note,
        },
      });
      benchmarkCount++;
    }
  }
  console.log(`${benchmarkCount} kira çapası yüklendi (${sources.length} kaynak)`);

  // --- Toplu ulaşım istasyonları (raylı sistem + metrobüs) ---
  const stationFile = readJson<StationFile>("data", "transit-stations.json");

  // Kaynak dosya tek doğru kaynak: her seed'de baştan yazılır
  await prisma.transitStation.deleteMany({});

  let unmatched = 0;
  const stationRows = stationFile.sources.flatMap((src) =>
    src.stations.map((st) => {
      // İstasyonun düştüğü ilçeyi sınır çokgeninden bul
      let neighborhoodId: number | null = null;
      for (const [slug, polys] of Object.entries(boundaries)) {
        if (polys.some((ring) => pointInRing(st.lng, st.lat, ring))) {
          neighborhoodId = idBySlug.get(slug) ?? null;
          break;
        }
      }
      if (neighborhoodId === null) unmatched++;
      return {
        name: st.name,
        line: st.line,
        mode: st.mode,
        stage: st.stage,
        lat: st.lat,
        lng: st.lng,
        neighborhoodId,
        method: src.method,
        source: src.name,
        sourceUrl: src.url,
        observedAt: new Date(src.retrievedAt),
      };
    }),
  );
  await prisma.transitStation.createMany({ data: stationRows });
  const existing = stationRows.filter((r) => r.stage === "EXISTING").length;
  console.log(
    `${stationRows.length} toplu ulaşım istasyonu yüklendi ` +
      `(${existing} mevcut, ${stationRows.length - existing} inşaat halinde` +
      `${unmatched > 0 ? `, ${unmatched} tanesi hiçbir ilçe sınırına düşmedi` : ""})`,
  );

  const listings = await prisma.propertyListing.count();
  const priceEntries = await prisma.priceEntry.count();
  console.log(`Tek tek ilan kaydı: ${listings} (kullanıcı katkısı bekleniyor)`);
  console.log(`Yaşam maliyeti fiyat gözlemi: ${priceEntries} (gerçek kaynak bağlanmadı)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
