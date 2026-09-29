import Link from "next/link";
import { Award, CalendarDays, CreditCard, FolderOpen, GraduationCap, IdCard, type LucideIcon } from "lucide-react";
import { formatDateOnly } from "@/lib/formatDate";
import { daysLeftLabel, type TimelineEntry, type TimelineKind } from "@/lib/studentJourney";
import { NoData } from "@/components/charts/ChartCard";

const ICON: Record<TimelineKind, LucideIcon> = {
  deadline: GraduationCap,
  payment: CreditCard,
  appointment: CalendarDays,
  document: FolderOpen,
  passport: IdCard,
  scholarship: Award,
};

const CHIP: Record<TimelineEntry["tone"], string> = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  muted: "bg-bg text-muted",
};

const DAY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

/** What is coming up, soonest first, down a line — each dated, and linked to where it is dealt with. */
export function UpcomingTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <NoData>Nothing dated coming up — we&rsquo;ll list deadlines and payments here.</NoData>;
  return (
    <ol className="relative flex flex-col gap-3 pl-6" data-timeline>
      <span aria-hidden className="absolute bottom-2 left-[11px] top-2 w-0.5 rounded-full bg-gradient-to-b from-primary/60 via-border to-border" />
      {entries.map((e, i) => {
        const body = (
          <>
            <span className="block text-sm text-ink">{e.label}</span>
            <span className="block text-xs text-muted">
              {formatDateOnly(e.date, DAY)}
              {e.detail ? ` · ${e.detail}` : ""}
            </span>
          </>
        );
        return (
          <li key={`${e.kind}-${e.date}-${i}`} className="relative flex items-start justify-between gap-3">
            <span
              aria-hidden
              className="absolute -left-6 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm"
            >
              {(() => {
                const Icon = ICON[e.kind];
                return <Icon className="h-3.5 w-3.5" />;
              })()}
            </span>
            {e.href ? (
              <Link href={e.href} className="min-w-0 hover:underline">
                {body}
              </Link>
            ) : (
              <span className="min-w-0">{body}</span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[e.tone]}`}>{daysLeftLabel(e.daysLeft)}</span>
          </li>
        );
      })}
    </ol>
  );
}
