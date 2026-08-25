import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { visibleReports } from "@/lib/reportsCatalogue";

const MONTHLY_TARGET = 5;

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const catalogue = visibleReports(staffRow?.role as never);

  const { data: leads } = await supabase.from("leads").select("id, status, assigned_counselor_id, registered_at, date_of_inquiry");
  const { data: logs } = await supabase.from("lead_call_logs").select("id, counselor:staff(full_name), created_at");
  const { data: visaRecords } = await supabase.from("visa_records").select("outcome");
  const { data: staff } = await supabase.from("staff").select("id, full_name").eq("role", "counselor");

  const today = new Date().toISOString().slice(0, 10);
  const { count: overdueTasks } = await supabase
    .from("application_tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("due_date", today);
  const { count: overdueReminders } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false)
    .lt("due_date", today);
  const overdueCount = (overdueTasks ?? 0) + (overdueReminders ?? 0);

  const totalLeads = leads?.length ?? 0;
  const registeredCount = (leads ?? []).filter((l) => l.registered_at).length;

  const byStatus = new Map<string, number>();
  (leads ?? []).forEach((l) => byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1));

  const callsByCounselor = new Map<string, number>();
  (logs ?? []).forEach((l) => {
    const name = one(l.counselor)?.full_name ?? "Unknown";
    callsByCounselor.set(name, (callsByCounselor.get(name) ?? 0) + 1);
  });

  const decidedVisas = (visaRecords ?? []).filter((v) => v.outcome !== "pending");
  const approvedVisas = decidedVisas.filter((v) => v.outcome === "approved");
  const visaApprovalRate = decidedVisas.length ? (approvedVisas.length / decidedVisas.length) * 100 : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const registeredThisMonth = new Map<string, number>();
  (leads ?? [])
    .filter((l) => l.registered_at && l.registered_at >= monthStart)
    .forEach((l) => {
      const key = l.assigned_counselor_id ?? "unassigned";
      registeredThisMonth.set(key, (registeredThisMonth.get(key) ?? 0) + 1);
    });

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Reports</h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total leads" value={totalLeads} />
        <StatCard label="Registered" value={registeredCount} tone="success" />
        <StatCard label="Visa approval rate" value={`${Math.round(visaApprovalRate)}%`} tone="success" />
        <StatCard label="Calls logged" value={logs?.length ?? 0} />
        <Link href="/calendar">
          <StatCard label="Overdue" value={overdueCount} tone={overdueCount > 0 ? "danger" : "default"} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-ink">Lead funnel</h3>
          <div className="flex flex-col gap-2">
            {[...byStatus.entries()].map(([status, count]) => {
              const pct = totalLeads === 0 ? 0 : Math.round((count / totalLeads) * 100);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-muted">{LEAD_STATUS_LABELS[status as never] ?? status}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="flex items-center justify-center">
          <RadialGauge percent={visaApprovalRate} label="Visa approval rate" />
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-medium text-ink">Counselor call activity</h3>
          {callsByCounselor.size === 0 ? (
            <p className="text-sm text-muted">No calls logged yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {[...callsByCounselor.entries()].map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{name}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-medium text-ink">Monthly registration target ({MONTHLY_TARGET}/counselor)</h3>
          <div className="flex flex-col gap-2">
            {(staff ?? []).map((s) => {
              const count = registeredThisMonth.get(s.id) ?? 0;
              const met = count >= MONTHLY_TARGET;
              return (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{s.full_name}</span>
                  <span className={met ? "text-success" : "animate-pulse text-danger"}>
                    {count}/{MONTHLY_TARGET} {!met && "— behind target"}
                  </span>
                </div>
              );
            })}
            {(!staff || staff.length === 0) && <p className="text-sm text-muted">No counselors yet.</p>}
          </div>
        </Card>
      </div>

      {catalogue.length > 0 && (
        <>
          <h3 className="mt-8 mb-3 text-sm font-medium text-ink">More reports</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {catalogue.map((r) => (
              <Link key={r.href} href={r.href}>
                <Card className="h-full transition hover:border-primary">
                  <p className="text-sm font-medium text-ink">{r.label}</p>
                  <p className="mt-1 text-xs text-muted">{r.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
