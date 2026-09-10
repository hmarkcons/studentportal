import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { StaffQueue, NamedStudent } from "@/lib/staffQueue";

// The work waiting on whoever is looking. Only true rows render — a dashboard
// listing "0 tickets waiting" is a dashboard people stop reading.
//
// Rows that point at a specific student name them and link straight to the
// right tab, because "3 agreements to verify" still leaves you hunting.

type Row = { href: string; icon: string; text: string; detail?: string; urgent?: boolean; students?: NamedStudent[] };

function studentList(students: NamedStudent[], tab: string) {
  // Three is enough to act on without turning the dashboard into a list page.
  const shown = students.slice(0, 3);
  return (
    <span className="mt-0.5 block text-xs text-muted">
      {shown.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ", "}
          <Link href={`/students/${s.id}${tab}`} className="text-primary hover:underline">
            {s.name}
          </Link>
        </span>
      ))}
      {students.length > shown.length && ` and ${students.length - shown.length} more`}
    </span>
  );
}

export function StaffQueueCard({ queue }: { queue: StaffQueue }) {
  const rows: Row[] = [];

  // First, and marked urgent: a missed application deadline cannot be
  // recovered by working faster tomorrow.
  if (queue.upcomingDeadlines.length > 0) {
    const soonest = queue.upcomingDeadlines[0];
    rows.push({
      href: "/calendar",
      icon: "⏰",
      text:
        queue.upcomingDeadlines.length === 1
          ? `${soonest.label} for ${soonest.studentName} — ${soonest.urgency}`
          : `${queue.upcomingDeadlines.length} application deadlines in the next fortnight — next ${soonest.urgency}`,
      detail: queue.upcomingDeadlines
        .slice(0, 3)
        .map((d) => `${d.studentName}: ${d.label} (${d.urgency})`)
        .join(" · "),
      urgent: true,
    });
  }

  if (queue.agreementsToVerify.length > 0) {
    rows.push({
      href: `/students/${queue.agreementsToVerify[0].id}`,
      icon: "📄",
      text: `${queue.agreementsToVerify.length} agreement${queue.agreementsToVerify.length === 1 ? "" : "s"} to verify`,
      // A student who has done their part is blocked until someone signs it
      // off, which is why this sits at the top.
      urgent: true,
      students: queue.agreementsToVerify,
    });
  }

  if (queue.ticketsWaiting > 0) {
    rows.push({
      href: "/support",
      icon: "🎧",
      text: `${queue.ticketsWaiting} support ${queue.ticketsWaiting === 1 ? "ticket" : "tickets"} waiting on a reply`,
      urgent: true,
    });
  }

  if (queue.unreadFrom.length > 0) {
    rows.push({
      href: `/students/${queue.unreadFrom[0].id}/communication`,
      icon: "💬",
      text: `${queue.unreadFrom.length} student${queue.unreadFrom.length === 1 ? "" : "s"} awaiting a reply`,
      students: queue.unreadFrom,
    });
  }

  if (queue.overdueTasks > 0) {
    rows.push({
      href: "/calendar",
      icon: "📅",
      text: `${queue.overdueTasks} task${queue.overdueTasks === 1 ? "" : "s"} past their due date`,
      urgent: true,
    });
  }

  if (queue.documentsToReview > 0) {
    rows.push({
      href: "/students",
      icon: "📁",
      text: `${queue.documentsToReview} document${queue.documentsToReview === 1 ? "" : "s"} to review`,
      detail: "Submitted by students and not yet accepted or sent back",
    });
  }

  if (queue.inventoryRequestsPending > 0) {
    rows.push({
      href: "/inventory",
      icon: "📦",
      text: `${queue.inventoryRequestsPending} inventory request${queue.inventoryRequestsPending === 1 ? "" : "s"} awaiting a decision`,
      detail: "Fulfil or turn down — a rejection needs a reason the requester can act on",
    });
  }

  if (queue.overdueInstalments > 0) {
    rows.push({
      href: "/finance/consultancy-fee",
      icon: "💳",
      text: `${queue.overdueInstalments} instalment${queue.overdueInstalments === 1 ? "" : "s"} overdue`,
      urgent: true,
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="mb-6">
        <p className="text-sm text-ink">Nothing is waiting on you.</p>
        <p className="mt-1 text-xs text-muted">
          Application deadlines, agreements to verify, tickets, unanswered students, overdue tasks, documents,
          inventory requests and payments all show here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <h3 className="mb-3 text-sm font-medium text-ink">Waiting on you</h3>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <div key={r.text} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2.5">
                <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
                  {r.icon}
                </span>
                <span className="min-w-0">
                  <Link
                    href={r.href}
                    className={`block text-sm hover:underline ${r.urgent ? "font-medium text-warning" : "text-ink"}`}
                  >
                    {r.text}
                  </Link>
                  {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                  {r.students && studentList(r.students, r.icon === "💬" ? "/communication" : "")}
                </span>
              </span>
              <Link href={r.href} aria-hidden className="shrink-0 text-xs text-muted">
                →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
