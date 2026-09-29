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

export function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const Icon = (NAV_ICONS as Record<string, LucideIcon>)[name];
  if (!Icon) return null;
  return <Icon aria-hidden className={`shrink-0 ${className}`} strokeWidth={1.9} />;
}
