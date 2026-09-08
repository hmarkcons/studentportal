"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudentTabs({
  studentId,
  showScholarship,
  unreadMessages = 0,
}: {
  studentId: string;
  showScholarship: boolean;
  /** Messages the student has sent that no one on the team has opened yet. */
  unreadMessages?: number;
}) {
  const pathname = usePathname();

  const tabs = [
    { label: "Dashboard", href: `/students/${studentId}` },
    { label: "Profile", href: `/students/${studentId}/profile` },
    { label: "Applications", href: `/students/${studentId}/applications` },
    { label: "Documents", href: `/students/${studentId}/documents` },
    // Visa lives on the student's own portal now and is sourced entirely from
    // the documentation tracker, which is where staff maintain it.
    ...(showScholarship ? [{ label: "Scholarship", href: `/students/${studentId}/scholarship` }] : []),
    { label: "Communication", href: `/students/${studentId}/communication`, badge: unreadMessages },
  ];

  return (
    // Wraps rather than scrolls: at some widths the strip cut the last tab by
    // only ~13px, too little to look scrollable, so "Communication" just read
    // as truncated. Same treatment as the pipeline stage strips.
    <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.href === `/students/${studentId}` ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            // Border colour is set inline because globals.css carries an
            // unlayered `* { border-color: var(--border) }`, which outranks
            // Tailwind's layered border-* colour utilities — so
            // border-transparent/border-primary here both render grey. On one
            // row those greys hid on the container's own bottom border; once
            // the strip wraps they would float under every first-row tab.
            style={{ borderBottomColor: active ? "var(--primary)" : "transparent" }}
            className={`-mb-px flex-shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "text-primary" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {Boolean(t.badge) && (
              <span className="ml-1.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
