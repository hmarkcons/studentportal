import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentApplicationsTab(props: PageProps<"/students/[id]/applications">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: applications } = await supabase
    .from("applications")
    .select(
      `id, current_stage, deadline,
       university:universities(name, destination:destinations(display_name)),
       program:programs(name)`
    )
    .eq("student_id", id)
    .order("created_at", { ascending: true });

  const byCountry = new Map<string, typeof applications>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;
    const country = dest?.display_name ?? "Unassigned";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push(a);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{applications?.length ?? 0} applications</p>
        <Link href={`/students/${id}/applications/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Add application
        </Link>
      </div>

      {(!applications || applications.length === 0) && (
        <Card>
          <p className="text-sm text-muted">No applications yet.</p>
        </Card>
      )}

      {Array.from(byCountry.entries()).map(([country, apps]) => (
        <Card key={country} className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Applications — {country}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">University</th>
                  <th className="py-2 pr-3">Program</th>
                  <th className="py-2 pr-3">Deadline</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(apps ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg/60">
                    <td className="py-2 pr-3">
                      <Link href={`/students/${id}/applications/${a.id}`} className="text-ink hover:text-primary">
                        {(one(a.university as never) as { name?: string } | null)?.name ?? "University"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-muted">{(one(a.program as never) as { name?: string } | null)?.name ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted">{a.deadline ? new Date(a.deadline).toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
