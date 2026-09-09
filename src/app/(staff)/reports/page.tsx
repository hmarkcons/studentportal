import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { visibleReports } from "@/lib/reportsCatalogue";
import { listVisaDecisions } from "@/lib/visaDecisions";
import { buildLeadOwners, ownerKey, karachiMonthKey, recentMonths } from "@/lib/leadOwners";

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
  const visaDecisions = await listVisaDecisions(supabase);
  const { data: staff } = await supabase.from("staff").select("id, full_name, role, status, monthly_target");

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

  const decidedVisas = visaDecisions.filter((v) => v.decision !== "pending");
  const approvedVisas = decidedVisas.filter((v) => v.decision === "approved");
  const visaApprovalRate = decidedVisas.length ? (approvedVisas.length / decidedVisas.length) * 100 : 0;

  // "This month" is Karachi's month. It was built from the server's clock,
  // which is UTC, so for the first five hours of each Karachi day the month
  // boundary was a day behind — and on the 1st, registrations taken that
  // morning counted towards the month just gone.
  const thisMonth = recentMonths(1).at(0)!.key;
  const registeredThisMonth = new Map<string, number>();
  for (const l of leads ?? []) {
    if (!l.registered_at || karachiMonthKey(l.registered_at) !== thisMonth) continue;
    const key = ownerKey(l);
    registeredThisMonth.set(key, (registeredThisMonth.get(key) ?? 0) + 1);
  }

  // Whoever holds leads, not only role='counselor' — see buildLeadOwners.
  // Anyone with a target set, plus anyone who registered someone this month
  // even without one: a manager who registered two students belongs on this
  // card, and a counselor at zero against a real target belongs there most of
  // all. The pulsing red animation is gone — on the 1st of the month it fired
  // for everybody, which is when it says least.
  const targetRows = buildLeadOwners(staff ?? [], leads ?? [])
    .filter((o) => !o.isUnassigned && !o.isInactive)
    .map((o) => ({ id: o.id, name: o.name, target: o.monthlyTarget, count: registeredThisMonth.get(o.id) ?? 0 }))
    .filter((r) => r.target !== null || r.count > 0);

  return (
    <div className="w-full">
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
            <EmptyState>No calls logged yet.</EmptyState>
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
          <h3 className="mb-1 text-sm font-medium text-ink">Monthly registration target</h3>
          {/* Each person's own target from their staff record. This card
              hardcoded 5 for everyone, so Muhammad Usman — whose target is 15 —
              was measured against a third of it and read as comfortably ahead. */}
          <p className="mb-3 text-xs text-muted">Registrations this month against each person&rsquo;s own target.</p>
          <div className="flex flex-col gap-2">
            {targetRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{r.name}</span>
                {r.target === null ? (
                  <span className="text-muted">{r.count} — no target set</span>
                ) : (
                  <span className={r.count >= r.target ? "text-success" : "text-danger"}>
                    {r.count}/{r.target}
                    {r.count < r.target && " — behind target"}
                  </span>
                )}
              </div>
            ))}
            {targetRows.length === 0 && <EmptyState>Nobody has a monthly target set yet.</EmptyState>}
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
