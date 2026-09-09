import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadTicketActivity, awaitingStaff } from "@/lib/supportSignals";
import { formatStamp } from "@/lib/activityStamp";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const STATUS_TONE: Record<string, "warning" | "info" | "success"> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
};

export default async function SupportTicketsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status: statusFilter } = await props.searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at, student:leads(full_name)")
    .order("updated_at", { ascending: false });
  if (statusFilter && ["open", "in_progress", "resolved"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  const { data: tickets } = await query;

  // "Waiting on us" is derived from the thread rather than stored: the newest
  // thing on the ticket came from the student, or nobody has replied at all.
  const activity = await loadTicketActivity(supabase, (tickets ?? []).map((t) => t.id));
  const rows = (tickets ?? []).map((t) => ({ ...t, waiting: awaitingStaff(t, activity) }));
  const waiting = rows.filter((r) => r.waiting);

  const tabs: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In progress" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Support Tickets</h2>
      <p className="mb-4 text-sm text-muted">
        {waiting.length === 0
          ? "Nothing is waiting on a reply."
          : `${waiting.length} ${waiting.length === 1 ? "ticket is" : "tickets are"} waiting on a reply from us.`}
      </p>

      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/support?status=${t.key}` : "/support"}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              (statusFilter ?? "") === t.key ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        <div className="flex flex-col divide-y divide-border">
          {rows.map((t) => {
            const student = one(t.student as never) as { full_name?: string } | null;
            return (
              <Link
                key={t.id}
                href={`/support/${t.id}`}
                className="flex items-center justify-between py-3 text-sm hover:bg-bg"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-ink">
                    <span className="truncate">{t.subject}</span>
                    {t.waiting && (
                      <span className="shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        Waiting on us
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">{student?.full_name ?? "Unknown student"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs text-muted" title="Last activity on this ticket">
                    {formatStamp(t.updated_at)}
                  </span>
                  <Badge tone={STATUS_TONE[t.status] ?? "warning"}>{t.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            );
          })}
          {rows.length === 0 && (
            <div className="py-6">
              <EmptyState>No tickets.</EmptyState>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
