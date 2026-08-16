import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { STAGES, STAGE_LABELS } from "@/lib/stages";
import { isStalled } from "@/lib/stall";

type Row = {
  id: string;
  current_stage: string;
  updated_at: string;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function counselorName(row: Row["assigned_counselor"]) {
  if (!row) return "Unassigned";
  return Array.isArray(row) ? row[0]?.full_name ?? "Unassigned" : row.full_name;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, current_stage, updated_at, assigned_counselor:staff(full_name)")
    .returns<Row[]>();

  const rows = students ?? [];
  const total = rows.length;
  const stalled = rows.filter((r) => isStalled(r.updated_at, r.current_stage));

  const byStage = new Map<string, number>(STAGES.map((s) => [s, 0]));
  rows.forEach((r) => byStage.set(r.current_stage, (byStage.get(r.current_stage) ?? 0) + 1));

  const byCounselor = new Map<string, number>();
  rows.forEach((r) => {
    const name = counselorName(r.assigned_counselor);
    byCounselor.set(name, (byCounselor.get(name) ?? 0) + 1);
  });
  const workload = [...byCounselor.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader active="dashboard" />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-base font-medium text-zinc-900 dark:text-zinc-50">Dashboard</h2>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Couldn&apos;t load dashboard data: {error.message}
            </p>
          )}

          {!error && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Total cases</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{total}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Stalled (7+ days)</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">{stalled.length}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Enrolled</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                    {byStage.get("enrollment") ?? 0}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                  <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Pipeline by stage</h3>
                  <div className="flex flex-col gap-2">
                    {STAGES.map((stage) => {
                      const count = byStage.get(stage) ?? 0;
                      const pct = total === 0 ? 0 : Math.round((count / total) * 100);
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                            {STAGE_LABELS[stage]}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                            <div className="h-full rounded-full bg-zinc-900 dark:bg-zinc-50" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                  <h3 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">Workload by counselor</h3>
                  {workload.length === 0 ? (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No cases yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {workload.map(([name, count]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-700 dark:text-zinc-300">{name}</span>
                          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
