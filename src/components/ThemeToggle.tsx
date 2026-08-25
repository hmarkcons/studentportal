"use client";

import { useState } from "react";

type Theme = "light" | "semi-dark" | "dark";
const ORDER: Theme[] = ["light", "semi-dark", "dark"];
const ICONS: Record<Theme, string> = { light: "☀️", "semi-dark": "🌗", dark: "🌙" };
const LABELS: Record<Theme, string> = { light: "Light", "semi-dark": "Semi-Dark", dark: "Dark" };

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("hmark-theme") as Theme | null;
  return stored && ORDER.includes(stored) ? stored : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem("hmark-theme", next);
    if (next === "light") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABELS[theme]} (click to change)`}
      suppressHydrationWarning
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm hover:bg-bg"
    >
      {ICONS[theme]}
    </button>
  );
}
