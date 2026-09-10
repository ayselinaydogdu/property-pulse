# PropertyPulse

Semt bazlı emlak fiyatlarını **ve** günlük yaşam maliyetini bir araya getiren, kullanıcının gelirine göre "nerede yaşamalıyım" sorusuna veriye dayalı cevap veren bir bölge karşılaştırma dashboard'u.

## Amaç

Türkiye'de ev/semt seçimi genellikle sadece kira fiyatına bakılarak yapılıyor. Ama gerçek yaşam maliyeti kira dışında; günlük harcamalar (kahve, market, ulaşım vb.) semtten semte ciddi şekilde değişiyor. Bu proje:

- Emlak fiyatlarını (kira, m² birim fiyatı, kira getirisi) semt bazlı karşılaştırır
- Buna ek olarak günlük yaşam maliyeti verisiyle bir "yaşam maliyeti endeksi" oluşturur
- Kullanıcı gelirini girdiğinde, bütçesine en uygun semtleri harita üzerinde gösterir

Amaç, sadece "ilginç bir veri görselleştirmesi" değil; taşınma/yerleşim kararını destekleyen **pratik bir karar aracı** olmak.

## Hızlı başlangıç

```bash
npm install
cp .env.example .env          # DATABASE_URL'i kendi Postgres'ine göre düzenle
npm run db:push               # şemayı veritabanına uygula
npm run db:seed               # data/ altındaki veriyi yükle
npm run dev                   # http://localhost:3000
npm test                      # birim testler
```

Örnek ilan verisini yeniden üretmek için: `npx tsx scripts/generate-listings.ts`

## Veri durumu

**Bu projede uydurma veri yoktur.** Kaynağı olmayan bir sayı veritabanına giremez (şemada `source`, `sourceUrl`, `observedAt` zorunlu alanlar) ve arayüzde gösterilmez - "veri yok" yazar.

| Veri | Durum | Kaynak |
|---|---|---|
| İlçe bazlı m² kira | **Bağlı** - İstanbul'un 39 ilçesi | [KiraMetre](https://www.kirametre.com/kira/istanbul), yayınlanmış ortalama, 09.09.2026 |
| İlçe koordinatları | Bağlı | [OpenStreetMap / Overpass API](https://overpass-api.de/api/interpreter), `admin_level=6` ilçe sınırlarının merkezi |
| İlçe sınırları (harita çokgenleri) | Bağlı | Aynı Overpass sorgusu, `out geom`; Douglas-Peucker ile ~65 m toleransla sadeleştirildi (42.171 → 4.916 nokta, 96 KB) |
| Raylı sistem istasyonları | **Bağlı** - 343 istasyon (268 mevcut, 75 inşaatta) | [İBB Açık Veri - Raylı Sistem İstasyon Noktaları](https://data.ibb.gov.tr/dataset/rayli-sistem-istasyon-noktalari-verisi), 05.06.2025 |
| Metrobüs istasyonları | **Bağlı** - 46 istasyon | [İBB Açık Veri - IETT GTFS](https://data.ibb.gov.tr/dataset/iett-gtfs-verisi), 21.04.2026 |
| Otobüs hizmet yoğunluğu | **Bağlı** - 39 ilçe | Aynı GTFS'ten hesaplandı (`scripts/build_bus_service.py`) |
| Kira endeksi (İstanbul geneli) | **Bağlı** - 34 çeyrek, 2018-Q1 → 2026-Q2 | TCMB EVDS, `TP.BK.ISTANBUL` (`scripts/fetch_evds_rent_index.py`) |
| Günlük harcamalar (kahve, market, hizmet) | **Toplanıyor** | Açık kaynağı yok; kullanıcı katkısıyla toplanıyor (`POST /api/contributions`) |
| İşe gidiş güzergâhı | **Bağlı** - 39/39 ilçe | Ağ istasyon verisinden kuruldu (`scripts/build_rail_network.py` + `src/lib/rail-graph.ts`) |
| İşe gidiş **süresi** (dakika) | **Yok** | Raylı sistem hız/sefer süresi verisi bulunamadı; durak-aktarma-mesafe veriliyor |
| Satılık m² fiyatı / kira getirisi | **Yok** | İlçe bazlı gerçek kaynak bulunamadı, özellik kaldırıldı |

### Hızlı ulaşım verisi hakkında

- Metro/Marmaray içeren **[Public Transport GTFS](https://data.ibb.gov.tr/dataset/public-transport-gtfs-data) veri seti kullanılmadı**: sayfasında "bu veri güncellenmeyecektir" notu var, metro verisi 2023'te kalmış. Onun yerine güncel (Haziran 2025) **Raylı Sistem İstasyon Noktaları** GeoJSON'u kullanıldı - metro, tramvay, banliyö (Marmaray), füniküler ve teleferiği kapsıyor.
- **İnşaat halindeki 75 istasyon ayrı tutuluyor** (`stage` alanı). Bugün erişim sağlamadıkları için erişim hesabına katılmıyorlar, ama veri korunuyor.
- İstasyonun hangi ilçeye düştüğü **nokta-poligon testiyle** (ray casting) hesaplanıyor. Mevcut 268 istasyonun 6'sı hiçbir ilçeye düşmüyor ve bu doğru: 5'i Kocaeli'nde (Marmaray Gebze'ye kadar gidiyor), Haliç ise metro köprüsünün üstünde, karada değil.
- **"En yakın istasyon" kuş uçuşu mesafedir** ve ilçe merkezinden ölçülür. Yürüme mesafesi değildir; gerçek erişim bundan zordur. Arayüzde bu not düşülüyor. (Bu yüzden Esenyurt gibi ilçelerde "5 istasyon var ama en yakını 4,1 km" görülebilir: metrobüs koridoru ilçenin güney kenarından geçiyor, merkezinden değil.)
- **Metrobüs neden hızlı ulaşımda?** Teknik olarak otobüstür ama ayrılmış yolda, yüksek sıklıkta, sabit istasyonlarla çalışır - erişim açısından raylı sisteme denktir.
- **Otobüste durak değil sıklık ölçülüyor.** İstanbul'un her ilçesinde otobüs durağı var; durak saymak ilçeleri ayırmaz. Ayırt eden şey sıklık - ve fark büyük: Fatih'te ortalama bir durağa hafta içi günde **~455 sefer** yapılırken Şile'de **~9**. (Sayılan şey araç değil, o durağa yapılan sefer - aynı otobüs gün içinde defalarca geçer.) Üstelik Şile'nin durağı daha çok (294 vs 171); durak saymanın neden yanıltıcı olduğunun kanıtı. `departuresPerStop` ilçe büyüklüğünden bağımsızdır. Sınırları: çok hatlı aktarma durakları sayıyı yukarı çeker ve sıklık, otobüsün *gitmek istediğin yere* gidip gitmediğini ölçmez.
- **Metrobüs verisi bir hatayı düzeltti.** Sadece raylı sistem varken Avcılar, Esenyurt, Büyükçekmece ve Beylikdüzü "hızlı ulaşım yok" görünüyordu - dördü de metrobüs koridorunda ve dördü de aracın "en ucuz" diye önerdiği batı ilçeleri. Hızlı ulaşımı olmayan ilçe sayısı 11'den 7'ye indi.
- Metrobüs durakları [İETT GTFS](https://data.ibb.gov.tr/dataset/iett-gtfs-verisi)'inden `routes` → `trips` → `stop_times` → `stops` zinciriyle çıkarıldı (34 hat ailesi: 34, 34A, 34AS, 34B, 34BZ, 34C, 34G, 34T, 34U, 34Z). Kaynaktaki koordinatlar **bozuk geliyor** (`stop_lat = 410.191.700.005.564` - Türkçe sayı biçimlendirmesi ondalığı binlik ayracına çevirmiş); rakamlar birleştirilip ondalık geri konuldu ve İstanbul sınır kutusuyla doğrulandı. Gidiş-dönüş için ayrı kayıtlı 90 durak, ada göre 46 istasyona indirildi.
- **Sınır sadeleştirmesinin bedeli:** 314 mevcut istasyonun 9'u hiçbir ilçeye düşmüyor. 6'sı doğru (5 Kocaeli'nde, Haliç metro köprüsünde), 2'si ~65 m'lik sadeleştirme toleransı yüzünden sınırın hemen dışına düşen sınır komşusu durak, 1'i belirsiz. Hiçbiri bir ilçenin sonucunu değiştirmiyor.

### TCMB EVDS hakkında

- Servis **EVDS 3'e taşındı**; eski `evds2.tcmb.gov.tr/service/evds/...` adresi artık 302 ile evds3 köküne yönlendiriyor. Güncel taban adres: `https://evds3.tcmb.gov.tr/igmevdsms-dis/`. API anahtarı **HTTP başlığında** gönderiliyor (`key: ...`), URL parametresi olarak değil (Nisan 2024 değişikliği).
- Konut Fiyat Endeksi yerine **`TP.BK.ISTANBUL` (İstanbul Konut Birim Kiraları)** kullanıldı: fiyat değil doğrudan **kira** ölçüyor, üç aylık ve TL/m² cinsinden mutlak değer veriyor. Kira çapalarını güncellemek için fiyat endeksinden daha uygun.
- Seri değerleme raporlarına dayanır, ilan veya kiracı beyanına değil - **seviyesi** başka kaynaklardan farklı olabilir (2026-Q2: 442,57 TL/m²). Bu yüzden seviye için değil, **zaman içindeki değişim** için kullanılıyor.
- İlçe kırılımı yok, İstanbul geneli tek değer.

### Güzergâh hesabı hakkında

- **Neden dakika yok?** Güzergâh (kaç durak, kaç aktarma, kaç km) tamamen veriden çıkıyor. Dakikaya çevirmek için hız gerekiyor ve raylı sistem hız/sefer süresi verisi bulunamadı. Uydurma bir hız katsayısıyla "47 dakika" yazmak, projenin tüm kurallarını çiğnerdi.
- **Sıralama nasıl doğrulandı?** Kadıköy → Levent için M4 (Kadıköy→Ayrılık Çeşmesi) → Marmaray (→Yenikapı) → M2 (→Levent) çıkıyor; gerçekte insanların gittiği yol bu. Üsküdar → Levent, Esenler → Levent ve Bağcılar → Kabataş da gerçek güzergâhlarla uyuşuyor. Bu kontroller birim testlere yazıldı.
- **Aktarma cezası bir modelleme tercihidir, ölçüm değil.** Sırf mesafeyi en aza indiren yol bazen üç aktarmalı saçma güzergâhlar üretiyordu. `TRANSFER_PENALTY_KM = 2` ("bir aktarma yaklaşık 2 km yol kadar zahmetlidir") sadece yol seçimini etkiler; gösterilen km gerçek mesafedir.
- **Kira ve işe yakınlık tek puana indirilmiyor.** İkisi farklı birimde (lira ve durak); birleştirmek "bir durak kaç lira eder" diye bir katsayı uydurmayı gerektirir ve bu katsayı kişiden kişiye değişir. Onun yerine **baskınlık** kullanılıyor: bir ilçe, kendisinden hem daha ucuz hem işe daha yakın başka bir ilçe varsa eleniyor. Elenmeyenler (Pareto sınırı) yıldızla işaretleniyor ve listenin başına geçiyor - aralarındaki tercih kullanıcının önceliğine kalıyor. İstasyona ulaşma mesafesi bu karşılaştırmaya girmez, kart rozetinde ayrıca gösterilir.
- **Hedef olarak semt de yazılabilir.** İnsanlar iş yerinin hangi istasyona yakın olduğunu bilmeyebilir ama hangi ilçede olduğunu bilir. İlçe adı girilirse o ilçenin en yakın istasyonuna çevrilir ve hangi istasyonun kullanıldığı arayüzde yazılır.
- **Yolculuk ilçe merkezine en yakın istasyondan başlar**, kullanıcının evinden değil. Bu mesafe 5 km'yi aşınca kart rozeti kırmızıya döner ve "+ 32,5 km istasyona" diye yazar - yoksa "Çatalca'dan işe 11 durak" yanıltıcı olurdu.

### Araştırma notları (neyin neden olmadığı)

- **TCMB EVDS Konut Fiyat Endeksi** İBBS Düzey 1/2 kırılımında; **ilçe kırılımı yok**. Mutlak değer için kullanılamaz, ama elle girilen çapaları güncel tutmak için endeks olarak kullanılabilir (planlanıyor).
- **İlçe bazlı kira için açık veri API'si yok.** İlan sitelerinden veri çekmek kullanım şartlarına aykırı. Bu yüzden yayınlanmış toplulaştırılmış istatistikler kaynak gösterilerek elle aktarılıyor - ayda 5 sayı.
- **İBB Açık Veri**'de ilçe bazlı tek konut verisi "İlçelere Göre Konut Satış Adedi" ve son güncellemesi 2024; fiyat içermiyor.
- **Market fiyatları semte göre anlamlı değişmiyor** (zincir marketler ülke geneli fiyatlıyor). Bu yüzden şehir geneli bir fiyatı ilçelere dağıtıp farklıymış gibi göstermek yerine şema `GeoScope.CITY` ile bunu işaretliyor.

### Veriyi güncelleme

`data/rent-benchmarks.json` içindeki kaynak sayfayı aç, değerleri ve `retrievedAt`'i güncelle, `npm run db:seed` çalıştır. Upsert olduğu için tekrar çalıştırmak güvenli.

Yeni bir ilçe/şehir eklemek için `data/neighborhoods.json`'a koordinat, `data/rent-benchmarks.json`'a kira değeri girilir. Koordinatlar Overpass API'den alınabilir:

```
[out:json];
area["name"="İstanbul"]["admin_level"="4"]->.il;
relation(area.il)["admin_level"="6"]["boundary"="administrative"];
out center tags;
```

## Mimarideki ana kararlar

- **Sepetin tanımı varsayım, fiyatları veri.** `data/cost-basket-definition.json` sadece "sepette ne var" der; `monthlyQty` (ayda kaç kahve) ölçülmüş bir değer değil, açıkça belirtilen bir varsayımdır. Fiyatlar kullanıcı katkısından gelir.
- **Kaynaksız sayı giremez.** Her fiyat kaydında `source`, `sourceUrl`, `observedAt`, `method` zorunlu. Uydurma veriyi disiplinle değil, şema kısıtıyla engelliyoruz.
- **Bilinmeyen `null` döner, sıfır sayılmaz.** Verisi olmayan kalem toplama dahil edilmez; arayüz "veri yok" gösterir ve eksik kalem varsa oranın yanına `+` koyar. Eksik veri varken hiçbir semt için "bütçene uygun" hükmü verilmez (`affordable: null`).
- **Olmayan kırılım uydurulmaz.** `GeoScope` alanı, şehir geneli bir fiyatın ilçelere dağıtılıp farklıymış gibi gösterilmesini engeller.
- **Türetilmiş sayı etiketlenir.** `PriceMethod.DERIVED`, endeksle güncellenmiş gibi hesaplanmış değerleri gözlemlenmiş değerlerden ayırır.
- **Kaynaklar çelişirse aralık gösterilir.** Aynı ilçe için birden fazla kaynak varsa tek sayı seçilmez; `hasSpread` ile min-max gösterilir. Sahte kesinlik de bir yanıltma biçimi.
- **Kira alana boyanır, noktaya değil.** Kira ilçenin tamamına ait bir değer; ilçe merkezine nokta koymak Çatalca'nın 1.700 km²'si ile Güngören'in 7 km²'sini aynı büyüklükte gösterirdi. Harita gerçek ilçe sınırlarını boyuyor (choropleth), böylece coğrafi örüntü (batı ucuz, Boğaz hattı pahalı) tek bakışta okunuyor.
- **Ham veri saklanır, gösterge hesaplanır.** `PropertyListing` tek tek kayıtlar için hazır ve şu an boş; kullanıcılar kendi kiralarını girdikçe ilçe ortalaması yayınlanmış çapa yerine kendi gözlemlerimizden hesaplanacak (medyan + IQR filtresi bunun için duruyor, eşik: 20 kayıt).
- **Fiyatlar tam sayı.** Kuruş integer olarak tutulur; float yuvarlama hatası birikmez.
- **Renkler doğrulanmış paletten.** Palet renk körlüğü ayrımı ve kontrast kontrollerinden hem açık hem koyu temada geçiyor. Tema renkleri `src/app/globals.css` içinde tek yerde tanımlı.

## API

| Endpoint | Ne döner |
|---|---|
| `GET /api/neighborhoods` | Tüm semtler: medyan kira, m² fiyatı, brüt getiri, sepet tutarı, maliyet endeksi |
| `GET /api/neighborhoods/[slug]` | Tek semtin detayı + sepet kırılımı |
| `GET /api/cost-index` | Sadece yaşam maliyeti endeksi (harita katmanı için) |
| `GET /api/contributions` | Sepet kalemleri ve şimdiye kadar toplanan katkı sayıları |
| `POST /api/contributions` | Kira ya da fiyat katkısı ekler |
| `GET /api/commute` | Seçilebilecek istasyonlar |
| `GET /api/commute?to=Levent` | Her ilçeden o istasyona güzergâh: durak, aktarma, km, bacaklar. `to` bir **ilçe adı** da olabilir; o ilçenin en yakın istasyonuna çevrilir |
| `GET /api/affordability?income=75000&areaM2=90&household=1&maxBurdenPct=60` | Gelire göre uygun semtler, kalan paraya göre sıralı |

Örnek:

```bash
curl "http://localhost:3000/api/affordability?income=75000&areaM2=80&household=2"
```

## Yol Haritası

### Tamamlanan
- [x] İstanbul'un **39 ilçesinin tamamı** - kira verisi ve OSM koordinatlarıyla
- [x] PostgreSQL + Prisma şeması, provenance alanları zorunlu
- [x] **Uydurma verinin tamamı silindi** (500 sentetik ilan + 60 uydurma fiyat)
- [x] Gerçek ilçe m² kira verisi, kaynağı ve tarihiyle
- [x] Aggregasyon API'si + gelire göre karşılaştırma
- [x] Leaflet choropleth haritası (gerçek ilçe sınırları), Recharts grafikler, açık/koyu tema
- [x] Eksik verinin arayüzde dürüstçe gösterilmesi ("veri yok", "+ eksik kalem", veri durumu paneli)
- [x] Aykırı değer filtresi (IQR) - kullanıcı katkısı geldiğinde devreye girecek
- [x] **Birim testler** (45 test, `npm test`) - medyan/çeyreklik/IQR filtresi, kuş uçuşu mesafe, nokta-poligon testi ve bütçe hesabı. Node'un yerleşik test koşucusu, ek bağımlılık yok.
- [x] **Hızlı ulaşım erişimi** - raylı sistem + metrobüs; haritada ayrı katman
- [x] **Otobüs hizmet yoğunluğu** - hafta içi sefer sıklığı, hat ve durak sayısı; haritada ayrı katman
- [x] **Kira + işe yakınlık ödünleşimi** - iş yeri girilince liste işe yakınlığa göre sıralanıyor ve baskılanmamış ilçeler yıldızlanıyor
- [x] **İşe gidiş güzergâhı** - kullanıcı iş yerine yakın istasyonu girer, her ilçeden kaç durak / kaç aktarma / kaç km olduğu hesaplanır. Dijkstra, 314 istasyonluk ağ üzerinde. Kadıköy → Levent için M4 → Marmaray → M2 çıkarıyor, gerçek güzergâhla aynı
- [x] **Kullanıcı katkı sistemi** - ilçe panelinden kendi kiranı ve gündelik fiyatları girme. Açık kaynağı olmayan iki veriyi doldurmanın tek yolu. Kira katkıları 20 kaydı geçince ilçenin ortalaması yayınlanmış çapa yerine kendi kayıtlarımızın medyanından hesaplanmaya başlar (IQR filtresi devreye girer)
- [x] **TCMB kira endeksi** - İstanbul geneli birim kira serisi; bağımsız çapraz kontrol olarak gösteriliyor ve çapalar bayatladığında oranlayarak güncelleyecek
- [x] **İlçe detay paneli** - satıra/haritaya/çubuğa tıklayınca sağdan açılır; kira özeti ve hızlı ulaşım hat hat: hattın kodu, türü (metro/tramvay/banliyö/metrobüs), adı, o ilçedeki istasyonları ve hattın İstanbul genelindeki toplam istasyon sayısı

### Sıradaki
- [ ] **Yolculuk süresi (dakika)** - güzergâh hesabı çalışıyor ama süre yok: raylı sistem hız verisi bulunamadı. Hat uzunluğu + uçtan uca sefer süresi yayınlanmış bir kaynak bulunursa eklenebilir.
- [ ] İkinci kira kaynağı ekleyip çelişen kaynakları aralık olarak göstermek
- [ ] `db push` yerine versiyonlu `prisma migrate`
- [ ] Vercel'e deploy

## Teknoloji Yığını

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 4, Recharts 3
- **Harita:** Leaflet + OpenStreetMap karoları
- **Backend:** Next.js API routes
- **Veritabanı:** PostgreSQL + Prisma 6
- **Deploy:** Vercel (planlanıyor)

## Proje yapısı

```
data/                     Kaynak veri dosyaları (seed'in tek doğru kaynağı)
  neighborhoods.json      39 ilçe: ad, slug, koordinat
  rent-benchmarks.json    İlçe bazlı m² kira, kaynağı ve tarihiyle
  district-boundaries.json  Harita çokgenleri
  transit-stations.json   389 istasyon (raylı sistem + metrobüs), kaynak bazlı
  bus-service.json        39 ilçe için otobüs hizmet yoğunluğu
  rent-index.json         TCMB İstanbul kira endeksi, 34 çeyrek
  rail-network.json       23 hat, 314 istasyon, sıralı
scripts/build_bus_service.py     GTFS'ten ilçe bazlı otobüs sıklığı üretir
scripts/fetch_evds_rent_index.py TCMB'den İstanbul kira endeksini çeker
scripts/build_rail_network.py    İstasyonları hat hat sıraya dizer
src/lib/rail-graph.ts            Ağ + Dijkstra ile en kısa yol
prisma/schema.prisma      Şema - provenance alanları zorunlu
prisma/seed.ts            data/ -> veritabanı yükleyici
src/lib/stats.ts          Medyan, çeyreklik, IQR outlier filtresi
src/lib/aggregate.ts      Semt göstergeleri + bütçe uygunluğu hesabı
src/lib/geo.ts            Kuş uçuşu mesafe (haversine) + nokta-poligon testi
src/lib/*.test.ts         Birim testler
src/app/api/              REST endpoint'leri
src/components/           Dashboard, harita, grafikler
```

## Kapsam notu

Proje başlangıçta "semt bazlı tam yaşam maliyeti haritası" olarak tasarlanmıştı. Araştırma sonucunda ilçe kırılımında günlük harcama verisinin (kahve, market, hizmet) hiçbir açık kaynakta bulunmadığı görüldü. Uydurma veriyle geniş kapsam göstermek yerine kapsam daraltıldı: sadece gerçek veriyle desteklenebilen kısım yapılıyor. Eksik olanlar arayüzde ve bu dosyada açıkça listeleniyor.
