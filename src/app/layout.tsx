import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Inter, arayüz ve veri ekranları için tasarlandı: rakamları dar ve hizalı,
 * küçük puntoda okunaklı. Yuvarlak "oyun" tipleri bu proje için yanlış olurdu -
 * finansal veriyle karar verdiren bir araç ciddi görünmeli.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"], // latin-ext: Türkçe ş, ğ, ı, İ
  display: "swap",
  variable: "--font-sans",
});

/**
 * Başlıklar için ayrı tip. Space Grotesk'in harf biçimleri karakterli ama
 * ciddi - oyun tiplerinin yuvarlaklığına kaçmıyor. Sadece başlıklarda;
 * gövde ve özellikle RAKAMLAR Inter'de kalıyor çünkü hizalı sütunlar
 * okunurluğun temeli.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "PropertyPulse - Semt Bazlı Yaşam Maliyeti & Emlak Haritası",
  description:
    "İstanbul semtlerini kira ve günlük yaşam maliyetiyle birlikte karşılaştır, gelirine göre uygun semtleri gör.",
};

/** İlk boyamada tema titremesi olmasın diye seçim body render'ından önce uygulanır. */
const themeScript = `
try {
  var t = localStorage.getItem("pp-theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
