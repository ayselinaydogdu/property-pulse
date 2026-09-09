/**
 * data/ altındaki dosyaları veritabanına yükler.
 *
 * Buraya SADECE kaynağı belli veri girer. Bir sayının kaynağı ve tarihi yoksa
 * veritabanına giremez - şema da buna izin vermez (source/sourceUrl zorunlu).
 */
import { PrismaClient, type PriceMethod } from "@prisma/client";
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

type BenchmarkFile = {
  sources: {
    key: string;
    name: string;
    url: string;
    method: PriceMethod;
    retrievedAt: string;
    periodNote?: string;
    sampleNote?: string;
    benchmarks: { neighborhoodSlug: string; rentPerM2: number; sampleSize?: number }[];
  }[];
};

async function main() {
  const { neighborhoods } = readJson<NeighborhoodFile>("data", "neighborhoods.json");
  const { sources } = readJson<BenchmarkFile>("data", "rent-benchmarks.json");

  const idBySlug = new Map<string, number>();
  for (const n of neighborhoods) {
    const row = await prisma.neighborhood.upsert({
      where: { slug: n.slug },
      update: { name: n.name, district: n.district, city: n.city, lat: n.lat, lng: n.lng },
      create: n,
    });
    idBySlug.set(n.slug, row.id);
  }
  console.log(`${neighborhoods.length} semt yüklendi`);

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
