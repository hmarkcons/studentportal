import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";

type Row = {
  id: string;
  student_id: string;
  current_stage: string;
  university: { name: string; destination: { display_name: string } | { display_name: string }[] | null } | { name: string; destination: unknown }[] | null;
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
      "id, student_id, current_stage, university:universities(name, destination:destinations(display_name)), student:leads(full_name)"
    )
    .returns<Row[]>();

  const byDestination = new Map<string, Row[]>();
  (applications ?? []).forEach((app) => {
    const uni = one(app.university);
    const dest = uni ? one(uni.destination as never) : null;
    const key = (dest as { display_name?: string } | null)?.display_name ?? "Unassigned";
    byDestination.set(key, [...(byDestination.get(key) ?? []), app]);
  });

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink">Applications</h2>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      <div className="flex flex-col gap-6">
        {[...byDestination.entries()].map(([destination, rows]) => (
          <div key={destination} className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-ink">
              {destination} <span className="text-muted">({rows.length})</span>
            </h3>
            <div className="flex flex-col divide-y divide-border">
              {rows.map((app) => (
                <Link
                  key={app.id}
                  href={`/students/${app.student_id}/applications/${app.id}`}
                  className="flex items-center justify-between py-2 text-sm hover:text-primary"
                >
                  <span>
                    {one(app.student)?.full_name} · {one(app.university)?.name}
                  </span>
                  <Badge tone="info">{app.current_stage.replace(/_/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {(!applications || applications.length === 0) && !error && <p className="text-sm text-muted">No applications yet.</p>}
      </div>
    </div>
  );
}
