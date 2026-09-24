"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudentTabs({
  studentId,
  showScholarship,
  showVisa = false,
  unreadMessages = 0,
  stagesOnly = false,
}: {
  studentId: string;
  showScholarship: boolean;
  /** Super Admin and Processing only — see canSeeVisaSection. */
  showVisa?: boolean;
  /** Messages the student has sent that no one on the team has opened yet. */
  unreadMessages?: number;
  /**
   * A counsellor with no processing role (seesStagesOnly): the processing
   * tabs are not theirs, so they are not offered. The pages refuse them too.
   */
  stagesOnly?: boolean;
}) {
  const pathname = usePathname();

  const all = [
    { label: "Dashboard", href: `/students/${studentId}` },
    { label: "Profile", href: `/students/${studentId}/profile` },
    // Documents before Applications: the documents come first in the real
    // process — nothing is applied for until they are collected and checked —
    // so the strip now reads in the order the work is actually done.
    { label: "Documents", href: `/students/${studentId}/documents` },
    { label: "Applications", href: `/students/${studentId}/applications` },
    ...(showScholarship ? [{ label: "Scholarship", href: `/students/${studentId}/scholarship` }] : []),
    // After Scholarship, because that is the order the work happens in: the
    // pre-enrolment settles, the DSU application goes in on its own deadline,
    // and the visa is applied for after both.
    //
    // Sourced entirely from the documentation tracker, which is still where
    // the whole tracker is maintained — this tab gathers the visa fields with
    // the appointment login and what the student is being shown. Super Admin
    // and Processing only: it carries a refusal history and a portal password.
    ...(showVisa ? [{ label: "Visa", href: `/students/${studentId}/visa` }] : []),
    { label: "Communication", href: `/students/${studentId}/communication`, badge: unreadMessages },
  ];
  const PROCESSING_TABS = ["Documents", "Applications", "Scholarship", "Visa"];
  const tabs = stagesOnly ? all.filter((t) => !PROCESSING_TABS.includes(t.label)) : all;

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
            // Every one of these tabs is a full page of its own — Documents,
            // Applications, Profile, Visa, Scholarship, Communication — and a
            // <Link> prefetches as soon as it is on screen. So opening one
            // student fired seven server renders of tabs nobody had clicked,
            // which was most of the two seconds this page spent working after
            // it had already finished loading. students/[id]/loading.tsx
            // paints a skeleton the moment a tab is clicked, so the feedback
            // prefetching was buying is still there.
            prefetch={false}
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
