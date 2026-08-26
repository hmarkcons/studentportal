import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewApplicationForStudent } from "./NewApplicationForStudent";

type Row = {
  id: string;
  student_id: string;
  current_stage: string;
  university: { destination: { pipeline_stages: string[] } | { pipeline_stages: string[] }[] | null } | { destination: unknown }[] | null;
  student: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ApplicationsBoardPage() {
  const supabase = await createClient();

  const { data: applications, error } = await supabase
    .from("applications")
    .select(
      "id, student_id, current_stage, university:universities(destination:destinations(pipeline_stages)), student:leads(full_name)"
    )
    .returns<Row[]>();

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");

  const byStudent = new Map<string, { name: string; rows: Row[] }>();
  (applications ?? []).forEach((app) => {
    const name = one(app.student)?.full_name ?? "Unknown";
    if (!byStudent.has(app.student_id)) byStudent.set(app.student_id, { name, rows: [] });
    byStudent.get(app.student_id)!.rows.push(app);
  });

  function counts(rows: Row[]) {
    let submitted = 0;
    let pending = 0;
    let offer = 0;
    for (const r of rows) {
      const uni = one(r.university as never) as { destination?: unknown } | null;
      const dest = uni?.destination ? (one(uni.destination as never) as { pipeline_stages?: string[] } | null) : null;
      const firstStage = dest?.pipeline_stages?.[0];
      if (r.current_stage === firstStage) pending++;
      else submitted++;
      if (r.current_stage.includes("offer")) offer++;
    }
    return { total: rows.length, submitted, pending, offer };
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Applications</h2>
        <NewApplicationForStudent students={students ?? []} />
      </div>
      {error && <p className="text-sm text-danger">{error.message}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Submitted</th>
              <th className="px-4 py-3 text-right">Pending submission</th>
              <th className="px-4 py-3 text-right">With offer letters</th>
            </tr>
          </thead>
          <tbody>
            {[...byStudent.entries()].map(([studentId, { name, rows }]) => {
              const c = counts(rows);
              return (
                <tr key={studentId} className="border-b border-border last:border-0 hover:bg-bg/60">
                  <td className="px-4 py-3">
                    <Link href={`/students/${studentId}/applications`} className="font-medium text-ink hover:text-primary">
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.total}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.submitted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.pending}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.offer}</td>
                </tr>
              );
            })}
            {byStudent.size === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No applications yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
