# PropertyPulse

Semt bazlı emlak fiyatlarını **ve** günlük yaşam maliyetini bir araya getiren, kullanıcının gelirine göre "nerede yaşamalıyım" sorusuna veriye dayalı cevap veren bir bölge karşılaştırma dashboard'u.

## Amaç

Türkiye'de ev/semt seçimi genellikle sadece kira fiyatına bakılarak yapılıyor. Ama gerçek yaşam maliyeti kira dışında; günlük harcamalar (kahve, market, ulaşım vb.) semtten semte ciddi şekilde değişiyor. Bu proje:

- Emlak fiyatlarını (kira, m² birim fiyatı, kira getirisi) semt bazlı karşılaştırır
- Buna ek olarak günlük yaşam maliyeti verisiyle bir "yaşam maliyeti endeksi" oluşturur
- Kullanıcı gelirini girdiğinde, bütçesine en uygun semtleri harita üzerinde gösterir

Amaç, sadece "ilginç bir veri görselleştirmesi" değil; taşınma/yerleşim kararını destekleyen **pratik bir karar aracı** olmak.

## Neden bu proje

Mevcut portföydeki projeler ağırlıklı olarak ML/NLP odaklı. Bu proje, klasik full-stack + veri entegrasyonu + coğrafi görselleştirme becerisini gösteren, farklı bir teknik hikaye kuruyor.

## Yol Haritası

### 1. Bölge ve kaynak seçimi
- [ ] Kapsanacak semtler/ilçeler belirlenir (başlangıç için 3–5 semt önerilir)
- [ ] Emlak verisi kaynakları belirlenir (scraping veya açık veri)
- [ ] Yaşam maliyeti sepeti tanımlanır: kahve, market sepeti, ulaşım, temel gıda kalemleri
- [ ] Yaşam maliyeti verisi için kaynak belirlenir (TÜİK açık veri / manuel toplama / crowdsourced)

### 2. Veri toplama (Scraping / ETL)
- [ ] Emlak sitelerinden veri çekme scripti (fiyat, m², konum, ilan tarihi)
- [ ] Yaşam maliyeti verisi için veri toplama/temizleme scripti
- [ ] Ham verinin normalize edilmesi (semt isimleri, birimler, tarih formatları)

### 3. Veritabanı şeması
- [ ] PostgreSQL + Prisma ile şema tasarımı
- [ ] Tablolar: `Neighborhood`, `PropertyListing`, `CostOfLivingItem`, `PriceEntry`
- [ ] Migration ve seed script'leri

### 4. Aggregasyon API'si (Next.js)
- [ ] Semt bazlı ortalama kira / m² fiyatı endpoint'i
- [ ] Semt bazlı yaşam maliyeti endeksi endpoint'i
- [ ] "Gelire göre uygun semtler" endpoint'i (kira + yaşam maliyeti toplamı ≤ bütçe)

### 5. Harita katmanı
- [ ] Leaflet veya Mapbox entegrasyonu
- [ ] İki katman arası geçiş: kira haritası / yaşam maliyeti haritası
- [ ] Semt üzerine tıklayınca detay popup (ortalama kira, sepet fiyatı, toplam maliyet)

### 6. Dashboard UI
- [ ] Tailwind ile arayüz
- [ ] Recharts ile semt karşılaştırma grafikleri
- [ ] Gelir girişi formu → uygun semtlerin listelenmesi/sıralanması

### 7. Doğrulama ve Deploy
- [ ] Aykırı veri/fiyat girişlerinin filtrelenmesi (outlier detection)
- [ ] Test ve son kontroller
- [ ] Vercel'e deploy

## Teknoloji Yığını

- **Frontend:** Next.js, Tailwind CSS, Recharts
- **Harita:** Leaflet / Mapbox
- **Backend:** Next.js API routes
- **Veritabanı:** PostgreSQL + Prisma
- **Deploy:** Vercel

## MVP Notu

Crowdsourced veri toplama zaman alıcı olduğundan, ilk aşamada 3–5 semt için sabit/açık kaynaklı bir yaşam maliyeti sepetiyle başlanması, kullanıcı katkılı veri toplamanın ise sonraki fazda eklenmesi planlanıyor.
