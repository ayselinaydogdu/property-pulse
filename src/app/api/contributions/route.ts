import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseContribution } from "@/lib/contributions";

const SOURCE = "Kullanıcı katkısı";

/**
 * POST /api/contributions
 *
 * Kullanıcıların kendi kirasını ya da bir sepet kaleminin fiyatını girdiği uç nokta.
 * Yayınlanmış hiçbir kaynakta olmayan iki veriyi burada topluyoruz.
 *
 * Katkılar method=OBSERVED olarak kaydedilir (kişinin kendi ödediği tutar bir
 * gözlemdir) ama kaynağı "Kullanıcı katkısı" olduğu için arayüzde yayınlanmış
 * kaynaklardan ayrı görünür.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Gövde JSON olmalı" }, { status: 400 });
  }

  const parsed = parseContribution(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const contribution = parsed.value;
  const observedAt = new Date();

  if (contribution.kind === "rent") {
    const neighborhood = await prisma.neighborhood.findUnique({
      where: { slug: contribution.neighborhoodSlug },
    });
    if (!neighborhood) {
      return NextResponse.json({ error: "İlçe bulunamadı" }, { status: 404 });
    }

    await prisma.propertyListing.create({
      data: {
        neighborhoodId: neighborhood.id,
        type: "RENT",
        price: contribution.monthlyRent,
        areaM2: contribution.areaM2,
        rooms: contribution.rooms,
        subArea: contribution.subArea,
        observedAt,
        method: "OBSERVED",
        source: SOURCE,
      },
    });

    const count = await prisma.propertyListing.count({
      where: { neighborhoodId: neighborhood.id, type: "RENT" },
    });

    return NextResponse.json({
      ok: true,
      neighborhood: neighborhood.name,
      contributions: count,
      // Bu eşiğe ulaşınca ilçenin kirası yayınlanmış çapa yerine kendi
      // kayıtlarımızın medyanından hesaplanmaya başlar
      threshold: 20,
      message:
        count >= 20
          ? `${neighborhood.name} artık kendi kayıtlarımızdan hesaplanıyor.`
          : `${neighborhood.name} için ${20 - count} katkı daha gerekiyor.`,
    });
  }

  const item = await prisma.costOfLivingItem.findUnique({
    where: { slug: contribution.itemSlug },
  });
  if (!item) {
    return NextResponse.json({ error: "Kalem bulunamadı" }, { status: 404 });
  }

  // scope=CITY kalemler ilçeye bağlanmaz: fiyat şehrin tamamı için geçerli
  let neighborhoodId: number | null = null;
  if (item.scope === "DISTRICT") {
    if (!contribution.neighborhoodSlug) {
      return NextResponse.json(
        { error: "Bu kalem ilçeye göre değişiyor, ilçe seçilmeli" },
        { status: 400 },
      );
    }
    const neighborhood = await prisma.neighborhood.findUnique({
      where: { slug: contribution.neighborhoodSlug },
    });
    if (!neighborhood) {
      return NextResponse.json({ error: "İlçe bulunamadı" }, { status: 404 });
    }
    neighborhoodId = neighborhood.id;
  }

  await prisma.priceEntry.create({
    data: {
      itemId: item.id,
      neighborhoodId,
      priceKurus: Math.round(contribution.price * 100),
      method: "OBSERVED",
      source: SOURCE,
      observedAt,
    },
  });

  const count = await prisma.priceEntry.count({
    where: { itemId: item.id, neighborhoodId },
  });

  return NextResponse.json({
    ok: true,
    item: item.name,
    contributions: count,
    message: `${item.name} için ${count} katkı toplandı.`,
  });
}

/** GET /api/contributions -> hangi kalemler için katkı bekleniyor */
export async function GET() {
  const [items, listingCount, priceCount] = await Promise.all([
    prisma.costOfLivingItem.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { entries: true } } },
    }),
    prisma.propertyListing.count(),
    prisma.priceEntry.count(),
  ]);

  return NextResponse.json({
    totals: { rentContributions: listingCount, priceContributions: priceCount },
    items: items.map((item) => ({
      slug: item.slug,
      name: item.name,
      category: item.category,
      unit: item.unit,
      scope: item.scope,
      /// Ölçülmüş veri değil, açıkça belirtilen varsayım
      monthlyQtyAssumption: item.monthlyQty,
      contributions: item._count.entries,
    })),
  });
}
