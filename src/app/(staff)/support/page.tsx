import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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

  const tabs: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In progress" },
    { key: "resolved", label: "Resolved" },
  ];

  return (
    <div className="w-full max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Support Tickets</h2>

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
          {(tickets ?? []).map((t) => {
            const student = one(t.student as never) as { full_name?: string } | null;
            return (
              <Link
                key={t.id}
                href={`/support/${t.id}`}
                className="flex items-center justify-between py-3 text-sm hover:bg-bg"
              >
                <div>
                  <p className="text-ink">{t.subject}</p>
                  <p className="text-xs text-muted">{student?.full_name ?? "Unknown student"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{new Date(t.updated_at).toLocaleDateString()}</span>
                  <Badge tone={STATUS_TONE[t.status] ?? "warning"}>{t.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            );
          })}
          {(!tickets || tickets.length === 0) && (
            <div className="py-6">
              <EmptyState>No tickets.</EmptyState>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
