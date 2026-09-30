import {
  Award,
  BookOpenText,
  CalendarDays,
  ChartColumn,
  CirclePlay,
  Contact,
  CreditCard,
  FileSignature,
  FolderKanban,
  FolderOpen,
  GraduationCap,
  HandCoins,
  Headset,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Package,
  Plane,
  Settings,
  Stamp,
  UserRound,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * The menu's icons, by name.
 *
 * The menus are built on the server (lib/nav.ts, lib/studentNav.ts) and handed
 * to the shell as data, which cannot carry a component — so an entry names its
 * icon and the shell draws it from this set. One set for every portal, so a
 * Dashboard or a Documents entry looks the same wherever it appears.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  leads: Contact,
  students: GraduationCap,
  applications: FolderKanban,
  calendar: CalendarDays,
  support: Headset,
  inventory: Package,
  setup: Settings,
  finance: Wallet,
  marketing: Megaphone,
  reports: ChartColumn,
  people: UsersRound,
  admin: Wrench,
  programs: BookOpenText,
  commissions: HandCoins,
  documents: FolderOpen,
  agreement: FileSignature,
  profile: UserRound,
  universities: Landmark,
  scholarship: Award,
  visa: Stamp,
  travel: Plane,
  payments: CreditCard,
  messages: MessageCircle,
  guide: CirclePlay,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

/**
 * Each section's own colour: its icon in the menu, and the icon at the top of
 * its page (AppShell hands it to the page as --page-accent). One of the five
 * accents in globals.css, picked so that no two neighbours in any portal's
 * menu share one. The brand green still marks the page you are on.
 */
const NAV_ACCENT: Record<string, 1 | 2 | 3 | 4 | 5> = {
  dashboard: 1,
  leads: 2,
  students: 5,
  applications: 3,
  calendar: 4,
  support: 2,
  inventory: 3,
  setup: 5,
  finance: 1,
  marketing: 4,
  reports: 2,
  people: 3,
  admin: 5,
  profile: 5,
  documents: 3,
  universities: 2,
  scholarship: 4,
  visa: 5,
  travel: 3,
  payments: 1,
  agreement: 4,
  messages: 5,
  guide: 3,
  programs: 5,
  commissions: 1,
};

export function navAccent(name: string | undefined): 1 | 2 | 3 | 4 | 5 | null {
  return (name && NAV_ACCENT[name]) || null;
}

/** Spelled out whole, so Tailwind finds each class. */
export const NAV_ACCENT_TEXT: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "text-[var(--accent-1)]",
  2: "text-[var(--accent-2)]",
  3: "text-[var(--accent-3)]",
  4: "text-[var(--accent-4)]",
  5: "text-[var(--accent-5)]",
};

export function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const Icon = (NAV_ICONS as Record<string, LucideIcon>)[name];
  if (!Icon) return null;
  return <Icon aria-hidden className={`shrink-0 ${className}`} strokeWidth={1.9} />;
}
