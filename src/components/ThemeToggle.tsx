"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(
      stored ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pp-theme", next);
    } catch {
      // gizli sekmede localStorage yazılamaz - tema yine de bu oturumda geçerli
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Temayı değiştir"
      className="rounded-lg border px-3 py-1.5 text-sm"
      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
    >
      {theme === "dark" ? "☀️ Açık" : "🌙 Koyu"}
    </button>
  );
}
