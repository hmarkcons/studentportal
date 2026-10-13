import { Award, KeyRound, Landmark, Mail, Stamp, type LucideIcon } from "lucide-react";
import type { LoginKind } from "@/lib/studentLogins";

// How each kind of login looks on the student's pages: the icon its section
// has in their menu, and that section's colour (NavIcon's accents). Not a
// client module, so a server page and the client LoginDetails share it.

export const LOGIN_KIND_ICON: Record<LoginKind, LucideIcon> = {
  email: Mail,
  university: Landmark,
  visa: Stamp,
  scholarship: Award,
  other: KeyRound,
};

type Accent = 1 | 2 | 3 | 4 | 5;

/** Spelled out whole, so Tailwind finds each class. */
export const ACCENT_CLASSES: Record<Accent, { card: string; tile: string; soft: string; chip: string }> = {
  1: {
    card: "border-[var(--accent-1)]/30 border-l-[var(--accent-1)] bg-[var(--accent-1-soft)] data-[focused]:ring-[var(--accent-1)]",
    tile: "text-[var(--accent-1-ink)]",
    soft: "bg-[var(--accent-1-soft)] text-[var(--accent-1-ink)]",
    chip: "border-[var(--accent-1)]/40 bg-[var(--accent-1-soft)] text-[var(--accent-1-ink)] hover:border-[var(--accent-1)]",
  },
  2: {
    card: "border-[var(--accent-2)]/30 border-l-[var(--accent-2)] bg-[var(--accent-2-soft)] data-[focused]:ring-[var(--accent-2)]",
    tile: "text-[var(--accent-2-ink)]",
    soft: "bg-[var(--accent-2-soft)] text-[var(--accent-2-ink)]",
    chip: "border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)] text-[var(--accent-2-ink)] hover:border-[var(--accent-2)]",
  },
  3: {
    card: "border-[var(--accent-3)]/30 border-l-[var(--accent-3)] bg-[var(--accent-3-soft)] data-[focused]:ring-[var(--accent-3)]",
    tile: "text-[var(--accent-3-ink)]",
    soft: "bg-[var(--accent-3-soft)] text-[var(--accent-3-ink)]",
    chip: "border-[var(--accent-3)]/40 bg-[var(--accent-3-soft)] text-[var(--accent-3-ink)] hover:border-[var(--accent-3)]",
  },
  4: {
    card: "border-[var(--accent-4)]/30 border-l-[var(--accent-4)] bg-[var(--accent-4-soft)] data-[focused]:ring-[var(--accent-4)]",
    tile: "text-[var(--accent-4-ink)]",
    soft: "bg-[var(--accent-4-soft)] text-[var(--accent-4-ink)]",
    chip: "border-[var(--accent-4)]/40 bg-[var(--accent-4-soft)] text-[var(--accent-4-ink)] hover:border-[var(--accent-4)]",
  },
  5: {
    card: "border-[var(--accent-5)]/30 border-l-[var(--accent-5)] bg-[var(--accent-5-soft)] data-[focused]:ring-[var(--accent-5)]",
    tile: "text-[var(--accent-5-ink)]",
    soft: "bg-[var(--accent-5-soft)] text-[var(--accent-5-ink)]",
    chip: "border-[var(--accent-5)]/40 bg-[var(--accent-5-soft)] text-[var(--accent-5-ink)] hover:border-[var(--accent-5)]",
  },
};
