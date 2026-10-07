// What a student has to do, line by line: the dashboard's "What needs doing"
// and the bell's "To do" both read it, so the two cannot word anything
// differently. Each line names an icon by key; the components draw it.

import { formatDateOnly } from "@/lib/formatDate";
import type { PortalSummary } from "@/lib/portalSummary";

export type StudentTodoIcon = "documents" | "payments" | "appointment" | "passport" | "profile" | "messages" | "support";

export type StudentTodo = {
  key: string;
  icon: StudentTodoIcon;
  href: string;
  text: string;
  detail?: string;
  urgent?: boolean;
  /** News as much as a to-do: the bell lists it under What's new instead. */
  news?: boolean;
};

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

export function studentTodos(summary: PortalSummary): StudentTodo[] {
  const rows: StudentTodo[] = [];

  if (summary.documentsNeedingAttention > 0) {
    rows.push({
      key: "documents",
      icon: "documents",
      href: "/portal/documents",
      text: `${summary.documentsNeedingAttention} document${summary.documentsNeedingAttention === 1 ? "" : "s"} to upload`,
      detail: "Missing or sent back for a replacement",
      urgent: true,
    });
  }

  if (summary.money && summary.money.outstanding > 0) {
    rows.push({
      key: "payments",
      icon: "payments",
      href: "/portal/payments",
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
      key: "appointment",
      icon: "appointment",
      href: "/portal/appointments",
      text: summary.nextAppointment.label,
      detail: `${formatDateOnly(summary.nextAppointment.date, LONG_DATE)} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      urgent: days <= 7,
    });
  }

  if (summary.passport.state === "expired") {
    rows.push({
      key: "passport",
      icon: "passport",
      href: "/portal/profile",
      text: "Your passport has expired",
      detail: `Expired ${formatDateOnly(summary.passport.expiry!, LONG_DATE)} — a visa cannot be filed until it is renewed`,
      urgent: true,
    });
  } else if (summary.passport.state === "expiring") {
    rows.push({
      key: "passport",
      icon: "passport",
      href: "/portal/profile",
      text: "Your passport expires soon",
      detail: `${formatDateOnly(summary.passport.expiry!, LONG_DATE)} · in ${summary.passport.daysLeft} days`,
      urgent: true,
    });
  }

  if (summary.profileMissing > 0) {
    rows.push({
      key: "profile",
      icon: "profile",
      href: "/portal/profile",
      text: `${summary.profileMissing} profile detail${summary.profileMissing === 1 ? "" : "s"} to add`,
      detail: "Needed for your visa application",
    });
  }

  if (summary.unreadMessages > 0) {
    rows.push({
      key: "messages",
      icon: "messages",
      href: "/portal/messages",
      text: `${summary.unreadMessages} new message${summary.unreadMessages === 1 ? "" : "s"}`,
      detail: "From your counsellor",
      news: true,
    });
  }

  if (summary.ticketsWithNewReply > 0) {
    rows.push({
      key: "support",
      icon: "support",
      href: "/portal/support",
      text: `${summary.ticketsWithNewReply} support ${summary.ticketsWithNewReply === 1 ? "ticket has" : "tickets have"} a reply`,
      detail: "From HMARK Support",
      news: true,
    });
  }

  return rows;
}
