import Link from "next/link";
import { ArrowRight, CalendarDays, CreditCard, FolderOpen, Headset, IdCard, ListChecks, ListTodo, MessageCircle, PartyPopper, UserRound, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { PortalSummary } from "@/lib/portalSummary";
import { studentTodos, type StudentTodoIcon } from "@/lib/studentTodos";

// "Is anything waiting on me" — the question a student opens the portal to
// answer. Only rows that are actually true are rendered: a dashboard listing
// "0 unread messages" trains people to stop reading it.

/** The icon each line of studentTodos names. */
export const STUDENT_TODO_ICON: Record<StudentTodoIcon, LucideIcon> = {
  documents: FolderOpen,
  payments: CreditCard,
  appointment: CalendarDays,
  passport: IdCard,
  profile: UserRound,
  messages: MessageCircle,
  support: Headset,
};

export function PortalAttention({ summary, className = "mb-6" }: { summary: PortalSummary; className?: string }) {
  // The same lines as the bell's To do (src/lib/studentTodos.ts).
  const rows = studentTodos(summary).map((r) => ({ ...r, icon: STUDENT_TODO_ICON[r.icon] }));

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
            prefetch={false}
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
