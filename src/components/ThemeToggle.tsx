"use client";

import { useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";

type Theme = "light" | "semi-dark" | "dark";
const ORDER: Theme[] = ["light", "semi-dark", "dark"];
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
      aria-label="Change theme"
      suppressHydrationWarning
      className="flex items-center justify-center rounded-md border border-border p-2.5 hover:bg-bg"
    >
      {/* All three are rendered and <html data-theme> picks one, rather than
          choosing from state: the server cannot know the stored theme, and a
          different SVG on the client is a hydration mismatch, not a text
          difference suppressHydrationWarning can cover. */}
      <Sun aria-hidden className="h-4 w-4 shrink-0 in-data-[theme=dark]:hidden in-data-[theme=semi-dark]:hidden" />
      <SunMoon aria-hidden className="hidden h-4 w-4 shrink-0 in-data-[theme=semi-dark]:block" />
      <Moon aria-hidden className="hidden h-4 w-4 shrink-0 in-data-[theme=dark]:block" />
    </button>
  );
}
