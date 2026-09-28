// The registered student's menu.
//
// In the order the journey runs — documents, then applications and the
// scholarship that follows admission, then the visa and the travel after it —
// with the two entries that only some students have slotted into place rather
// than tacked on at the end:
//
//   Scholarship        when a country the student is going to has a
//                      scholarship body on file, or a scholarship is already
//                      recorded for them. A country with nothing to offer
//                      gets no entry, so the menu never promises one.
//   Travel & Arrival   once a visa has been issued; never for a refusal.
//
// While the agreement gate is closed only the pages it allows are offered
// (portalGate.ts) — the proxy refuses the rest anyway.
//
// Pure, so it is unit-tested (scripts/student-nav-test.mjs).

import type { NavItem } from "@/components/AppShell";
import { isGateAllowedPath } from "./portalGate.ts";

export type StudentNavInput = {
  locked: boolean;
  scholarship: boolean;
  travel: boolean;
  /** Unread counts by href — messages, support replies. */
  badges?: Record<string, number>;
};

export function studentNav({ locked, scholarship, travel, badges = {} }: StudentNavInput): NavItem[] {
  const items: NavItem[] = [
    { label: "Dashboard", href: "/portal", icon: "🏠" },
    { label: "Profile", href: "/portal/profile", icon: "👤" },
    { label: "Documents", href: "/portal/documents", icon: "📁" },
    { label: "Applications", href: "/portal/applications", icon: "🏛️" },
    ...(scholarship ? [{ label: "Scholarship", href: "/portal/scholarship", icon: "🎓" }] : []),
    { label: "Visa", href: "/portal/visa", icon: "🛂" },
    ...(travel ? [{ label: "Travel & Arrival", href: "/portal/travel", icon: "✈️" }] : []),
    { label: "Appointments", href: "/portal/appointments", icon: "📅" },
    { label: "Payments", href: "/portal/payments", icon: "💳" },
    { label: "Agreement", href: "/portal/agreement", icon: "📄" },
    { label: "Messages", href: "/portal/messages", icon: "💬" },
    { label: "Support", href: "/portal/support", icon: "🎧" },
    { label: "Guide", href: "/portal/guide", icon: "🎬" },
  ];
  const open = locked ? items.filter((item) => Boolean(item.href) && isGateAllowedPath(item.href!)) : items;
  return open.map((item) => {
    const badge = item.href ? (badges[item.href] ?? 0) : 0;
    return badge > 0 ? { ...item, badge } : item;
  });
}
