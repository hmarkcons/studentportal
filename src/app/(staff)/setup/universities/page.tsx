import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewUniversityForm } from "./NewUniversityForm";

export default async function UniversitiesPage() {
  const supabase = await createClient();
  const { data: universities } = await supabase
    .from("universities")
    .select("id, name, type, status, destination:destinations(display_name)")
    .order("name");
  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Universities</h2>
      <Card className="mb-6">
        <NewUniversityForm destinations={destinations ?? []} />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(universities ?? []).map((u) => (
          <Link key={u.id} href={`/setup/universities/${u.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-bg">
            <span className="text-ink">
              {u.name} <span className="text-muted">· {one(u.destination)?.display_name}</span>
            </span>
            <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.type}</Badge>
          </Link>
        ))}
        {(!universities || universities.length === 0) && <p className="px-4 py-6 text-sm text-muted">No universities yet.</p>}
      </div>
    </div>
  );
}
