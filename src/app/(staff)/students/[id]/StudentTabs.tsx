"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudentTabs({ studentId, showScholarship }: { studentId: string; showScholarship: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { label: "Dashboard", href: `/students/${studentId}` },
    { label: "Profile", href: `/students/${studentId}/profile` },
    { label: "Applications", href: `/students/${studentId}/applications` },
    { label: "Documents", href: `/students/${studentId}/documents` },
    { label: "Visa", href: `/students/${studentId}/visa` },
    ...(showScholarship ? [{ label: "Scholarship", href: `/students/${studentId}/scholarship` }] : []),
    { label: "Communication", href: `/students/${studentId}/communication` },
  ];

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.href === `/students/${studentId}` ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
