import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { STAGES, STAGE_LABELS } from "@/lib/stages";
import { StageMover } from "@/components/StageMover";
import { isStalled } from "@/lib/stall";

type BoardRow = {
  id: string;
  full_name: string;
  destination_country: string;
  current_stage: string;
  updated_at: string;
  assigned_counselor: { full_name: string } | { full_name: string }[] | null;
};

function counselorName(row: BoardRow["assigned_counselor"]) {
  if (!row) return "Unassigned";
  return Array.isArray(row) ? row[0]?.full_name ?? "Unassigned" : row.full_name;
}

export default async function BoardPage() {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, full_name, destination_country, current_stage, updated_at, assigned_counselor:staff(full_name)")
    .order("updated_at", { ascending: false })
    .returns<BoardRow[]>();

  const byStage = new Map<string, BoardRow[]>(STAGES.map((s) => [s, []]));
  (students ?? []).forEach((s) => byStage.get(s.current_stage)?.push(s));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <AppHeader active="board" />
      <main className="flex-1 px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">Pipeline</h2>
          <Link
            href="/students/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + New case
          </Link>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Couldn&apos;t load the board: {error.message}
          </p>
        )}

        {!error && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const rows = byStage.get(stage) ?? [];
              return (
                <div
                  key={stage}
                  className="flex w-64 flex-shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{rows.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {rows.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">Empty</p>
                    )}
                    {rows.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/students/${s.id}`}
                            className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                          >
                            {s.full_name}
                          </Link>
                          {isStalled(s.updated_at, s.current_stage) && (
                            <span
                              title="No movement in 7+ days"
                              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            >
                              stalled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {s.destination_country} &middot; {counselorName(s.assigned_counselor)}
                        </p>
                        <StageMover studentId={s.id} currentStage={s.current_stage} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
