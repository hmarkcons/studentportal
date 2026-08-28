import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: counselors } = await supabase
    .from("staff")
    .select("id, full_name, monthly_target")
    .eq("role", "counselor")
    .eq("status", "active")
    .order("full_name");

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const { data: leads } = await supabase
    .from("leads")
    .select("id, assigned_counselor_id")
    .not("registered_at", "is", null)
    .gte("registered_at", monthStart);

  const registeredThisMonth = new Map<string, number>();
  (leads ?? []).forEach((l) => {
    if (!l.assigned_counselor_id) return;
    registeredThisMonth.set(l.assigned_counselor_id, (registeredThisMonth.get(l.assigned_counselor_id) ?? 0) + 1);
  });

  const rows = (counselors ?? [])
    .map((c) => {
      const count = registeredThisMonth.get(c.id) ?? 0;
      const target = c.monthly_target ?? null;
      const pct = target ? Math.min(100, Math.round((count / target) * 100)) : 0;
      return { id: c.id, name: c.full_name, count, target, pct, met: target != null && count >= target };
    })
    .sort((a, b) => b.pct - a.pct);

  const totalRegistered = rows.reduce((sum, r) => sum + r.count, 0);
  const withTargets = rows.filter((r) => r.target != null);
  const teamAvgPct = withTargets.length ? Math.round(withTargets.reduce((sum, r) => sum + r.pct, 0) / withTargets.length) : 0;
  const onTrackCount = rows.filter((r) => r.met).length;

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Dashboard</h2>
      <p className="mb-6 text-sm text-muted">Team registration performance for {monthLabel}.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Registered this month" value={totalRegistered} tone="success" />
        <StatCard label="Counselors on track" value={`${onTrackCount}/${rows.length}`} />
        <StatCard label="Team avg. of target" value={`${teamAvgPct}%`} />
        <StatCard label="Active counselors" value={rows.length} />
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-ink">Monthly registration target by counselor</h3>
        {rows.length === 0 ? (
          <EmptyState>No active counselors yet.</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink">{r.name}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-bg">
                  <div
                    className={`h-full rounded-full ${r.met ? "bg-success" : "bg-warning"}`}
                    style={{ width: `${r.target ? r.pct : 0}%` }}
                  />
                </div>
                <span className={`w-24 shrink-0 text-right text-xs tabular-nums ${r.met ? "text-success" : "text-warning"}`}>
                  {r.count}/{r.target ?? "—"}
                  {r.target ? ` (${r.pct}%)` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
