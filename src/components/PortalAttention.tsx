import Link from "next/link";
import { ArrowRight, CalendarDays, CreditCard, FolderOpen, Headset, IdCard, ListChecks, ListTodo, MessageCircle, PartyPopper, UserRound, type LucideIcon } from "lucide-react";
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

type Row = { href: string; icon: LucideIcon; text: string; detail?: string; urgent?: boolean };

export function PortalAttention({ summary, className = "mb-6" }: { summary: PortalSummary; className?: string }) {
  const rows: Row[] = [];

  if (summary.documentsNeedingAttention > 0) {
    rows.push({
      href: "/portal/documents",
      icon: FolderOpen,
      text: `${summary.documentsNeedingAttention} document${summary.documentsNeedingAttention === 1 ? "" : "s"} to upload`,
      detail: "Missing or sent back for a replacement",
      urgent: true,
    });
  }

  if (summary.money && summary.money.outstanding > 0) {
    rows.push({
      href: "/portal/payments",
      icon: CreditCard,
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
      icon: CalendarDays,
      text: summary.nextAppointment.label,
      detail: `${formatDateOnly(summary.nextAppointment.date, LONG_DATE)} · ${
        days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
      }`,
      // A week is the point at which an appointment stops being a diary entry
      // and starts being something to prepare for.
      urgent: days <= 7,
    });
  }

  // A passport problem outranks an incomplete field: it needs a government
  // office, not five minutes on a form.
  if (summary.passport.state === "expired") {
    rows.push({
      href: "/portal/profile",
      icon: IdCard,
      text: "Your passport has expired",
      detail: `Expired ${formatDateOnly(summary.passport.expiry!, LONG_DATE)} — a visa cannot be filed until it is renewed`,
      urgent: true,
    });
  } else if (summary.passport.state === "expiring") {
    rows.push({
      href: "/portal/profile",
      icon: IdCard,
      text: "Your passport expires soon",
      detail: `${formatDateOnly(summary.passport.expiry!, LONG_DATE)} · in ${summary.passport.daysLeft} days`,
      urgent: true,
    });
  }

  if (summary.profileMissing > 0) {
    rows.push({
      href: "/portal/profile",
      icon: UserRound,
      text: `${summary.profileMissing} profile detail${summary.profileMissing === 1 ? "" : "s"} to add`,
      detail: "Needed for your visa application",
    });
  }

  if (summary.unreadMessages > 0) {
    rows.push({
      href: "/portal/messages",
      icon: MessageCircle,
      text: `${summary.unreadMessages} new message${summary.unreadMessages === 1 ? "" : "s"}`,
      detail: "From your counsellor",
    });
  }

  if (summary.ticketsWithNewReply > 0) {
    rows.push({
      href: "/portal/support",
      icon: Headset,
      text: `${summary.ticketsWithNewReply} support ${summary.ticketsWithNewReply === 1 ? "ticket has" : "tickets have"} a reply`,
      detail: "From HMARK Support",
    });
  }

  if (rows.length === 0) {
    return (
      <Card className={className}>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ListChecks aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          What needs doing
        </h3>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success ring-8 ring-success-bg/50">
            <PartyPopper className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-ink">Nothing needs your attention right now.</p>
          <p className="max-w-xs text-xs text-muted">
            We&rsquo;ll show anything outstanding here — documents, payments, appointments, profile details and replies.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-ink" data-attention>
        <span className="flex items-center gap-2">
          <ListTodo aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          What needs doing
        </span>
        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">{rows.length}</span>
      </h3>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <Link
            key={r.href + r.text}
            href={r.href}
            className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              r.urgent ? "border-warning/30 bg-warning-bg/60 hover:bg-warning-bg" : "border-border hover:bg-bg"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${r.urgent ? "bg-card text-warning" : "bg-primary/10 text-primary"}`}
              >
                <r.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${r.urgent ? "font-medium text-warning" : "text-ink"}`}>{r.text}</span>
                {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
              </span>
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
