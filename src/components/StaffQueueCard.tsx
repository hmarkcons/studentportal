import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarClock, CircleCheck, CreditCard, FileSearch, FileText, Headset, MessageSquare, Package, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { StaffQueue } from "@/lib/staffQueue";
import { WAITING_KINDS, countLine, sortItems, type WaitingItem, type WaitingKind } from "@/lib/waitingItems";

// The work waiting on whoever is looking. Only true rows render — a dashboard
// listing "0 tickets waiting" is a dashboard people stop reading.
//
// Each line names its first few items — whose, and what — and each opens
// exactly where it is dealt with: a document on the student's Documents tab,
// picked out; a task at its row; a ticket in its thread. "3 documents to
// review" on its own still left the reader hunting through every student.
// Everything is on /waiting, which each line opens at its own kind.

export const KIND_ICON: Record<WaitingKind, LucideIcon> = {
  deadline: AlarmClock,
  agreement: FileText,
  ticket: Headset,
  message: MessageSquare,
  task: CalendarClock,
  document: FileSearch,
  inventory: Package,
  instalment: CreditCard,
};

/** Shown under its line: enough to act on without turning the dashboard into the list page. */
const SHOWN = 3;

/** How an item reads in a short list: whose, then what — the student alone where "what" says nothing more. */
export function itemLabel(item: WaitingItem): string {
  if (item.kind === "message") return item.studentName ?? item.title;
  if (!item.studentName) return item.title;
  return `${item.studentName} — ${item.title}`;
}

/**
 * A link to where an item is dealt with. A document goes through
 * /waiting/open, a route that marks it seen before landing on it, so it is a
 * plain link — the router would otherwise try to render the route as a page.
 */
export function ItemLink({ item, className, children }: { item: WaitingItem; className?: string; children: React.ReactNode }) {
  const data = { "data-waiting-item": `${item.kind}:${item.id}` };
  if (item.kind === "document") {
    return (
      <a href={item.href} className={className} {...data}>
        {children}
      </a>
    );
  }
  return (
    <Link prefetch={false} href={item.href} className={className} {...data}>
      {children}
    </Link>
  );
}

export function StaffQueueCard({ queue }: { queue: StaffQueue }) {
  const lines = WAITING_KINDS.map((k) => ({ kind: k.kind, items: sortItems(queue.items.filter((i) => i.kind === k.kind)) })).filter(
    (l) => l.items.length > 0
  );

  if (lines.length === 0) {
    return (
      <Card className="mb-6">
        <div data-queue-empty className="flex items-start gap-3">
          <span aria-hidden data-queue-tick className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-strong)]">
            <CircleCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Nothing is waiting on you.</p>
            <p className="mt-1 text-xs text-muted">
              Application deadlines, agreements to verify, tickets, unanswered students, overdue tasks, documents,
              inventory requests and payments all show here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">Waiting on you</h3>
        <Link prefetch={false} href="/waiting" className="text-xs font-medium text-primary hover:underline" data-waiting-all>
          See everything ({queue.items.length})
        </Link>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {lines.map(({ kind, items }) => {
          const Icon = KIND_ICON[kind];
          const urgent = items.some((i) => i.urgent);
          const href = `/waiting?kind=${kind}`;
          const shown = items.slice(0, SHOWN);
          return (
            <div key={kind} className="py-2.5" data-waiting-line={kind}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${urgent ? "text-warning" : "text-muted"}`} />
                  <div className="min-w-0 flex-1">
                    <Link
                      prefetch={false}
                      href={href}
                      className={`block text-sm hover:underline ${urgent ? "font-medium text-warning" : "text-ink"}`}
                    >
                      {countLine(kind, items.length)}
                    </Link>
                    {/* One item a line — whose, what, how long — so a list of
                        three reads as three things to do, not one paragraph. */}
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                      {shown.map((item) => (
                        <li key={item.id} className="flex min-w-0 items-baseline gap-3">
                          <ItemLink item={item} className="min-w-0 flex-1 truncate text-primary hover:underline">
                            {item.studentName && item.kind !== "message" ? (
                              <>
                                <span className="font-medium">{item.studentName}</span> — {item.title}
                              </>
                            ) : (
                              itemLabel(item)
                            )}
                          </ItemLink>
                          <span className="hidden shrink-0 text-muted sm:inline">
                            {item.opened ? `opened by ${item.opened.by}` : item.detail}
                          </span>
                        </li>
                      ))}
                      {items.length > shown.length && (
                        <li className="text-muted">
                          and {items.length - shown.length} more ·{" "}
                          <Link prefetch={false} href={href} className="font-medium text-primary hover:underline">
                            See all
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
                <Link prefetch={false} href={href} aria-hidden tabIndex={-1} className="shrink-0 text-muted hover:text-ink">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
