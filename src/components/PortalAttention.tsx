import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatDateOnly } from "@/lib/formatDate";
import type { PortalSummary } from "@/lib/portalSummary";

// "Is anything waiting on me" — the question a student opens the portal to
// answer. Only rows that are actually true are rendered: a dashboard listing
// "0 unread messages" trains people to stop reading it.

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

type Row = { href: string; icon: string; text: string; detail?: string; urgent?: boolean };

export function PortalAttention({ summary }: { summary: PortalSummary }) {
  const rows: Row[] = [];

  if (summary.documentsNeedingAttention > 0) {
    rows.push({
      href: "/portal/documents",
      icon: "📁",
      text: `${summary.documentsNeedingAttention} document${summary.documentsNeedingAttention === 1 ? "" : "s"} to upload`,
      detail: "Missing or sent back for a replacement",
      urgent: true,
    });
  }

  if (summary.money && summary.money.outstanding > 0) {
    rows.push({
      href: "/portal/payments",
      icon: "💳",
      text: `${money(summary.money.currency, summary.money.outstanding)} outstanding`,
      detail: summary.money.nextDueDate
        ? `${summary.money.overdue ? "Overdue — was due" : "Next instalment due"} ${formatDateOnly(summary.money.nextDueDate, LONG_DATE)}`
        : "No due date set yet",
      urgent: summary.money.overdue,
    });
  }

  if (summary.nextAppointment) {
    const days = summary.daysToAppointment ?? 0;
    rows.push({
      href: "/portal/appointments",
      icon: "📅",
      text: summary.nextAppointment.label,
      detail: `${formatDateOnly(summary.nextAppointment.date, LONG_DATE)} · ${
        days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
      }`,
      // A week is the point at which an appointment stops being a diary entry
      // and starts being something to prepare for.
      urgent: days <= 7,
    });
  }

  if (summary.unreadMessages > 0) {
    rows.push({
      href: "/portal/messages",
      icon: "💬",
      text: `${summary.unreadMessages} new message${summary.unreadMessages === 1 ? "" : "s"}`,
      detail: "From your counsellor",
    });
  }

  if (summary.ticketsWithNewReply > 0) {
    rows.push({
      href: "/portal/support",
      icon: "🎧",
      text: `${summary.ticketsWithNewReply} support ${summary.ticketsWithNewReply === 1 ? "ticket has" : "tickets have"} a reply`,
      detail: "From HMARK Support",
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="mb-6">
        <p className="text-sm text-ink">Nothing needs your attention right now.</p>
        <p className="mt-1 text-xs text-muted">
          We&rsquo;ll show anything outstanding here — documents, payments, appointments and replies.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <h3 className="mb-3 text-sm font-medium text-ink">Needs your attention</h3>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <Link
            key={r.href + r.text}
            href={r.href}
            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-bg"
          >
            <span className="flex min-w-0 items-start gap-2.5">
              <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
                {r.icon}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${r.urgent ? "font-medium text-warning" : "text-ink"}`}>{r.text}</span>
                {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-xs text-muted">
              →
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
