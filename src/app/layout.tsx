import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
