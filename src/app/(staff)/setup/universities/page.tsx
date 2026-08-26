import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewUniversityForm } from "./NewUniversityForm";
import { ImportUniversitiesForm } from "./ImportUniversitiesForm";
import { DeleteUniversityIcon } from "./DeleteUniversityIcon";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function UniversitiesPage(props: { searchParams: Promise<{ destination?: string }> }) {
  const { destination: destinationFilter } = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  let query = supabase
    .from("universities")
    .select("id, name, city, type, status, destination_id, destination:destinations(display_name)")
    .order("name");
  if (destinationFilter) query = query.eq("destination_id", destinationFilter);
  const { data: universities } = await query;

  const { data: destinations } = await supabase.from("destinations").select("id, display_name").order("display_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Universities</h2>
      <Card className="mb-6">
        <NewUniversityForm destinations={destinations ?? []} />
        <ImportUniversitiesForm destinations={destinations ?? []} />
      </Card>

      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href="/setup/universities"
          className={`rounded-full border px-3 py-1 text-xs ${!destinationFilter ? "border-primary bg-primary text-primary-ink" : "border-border text-muted hover:text-ink"}`}
        >
          All ({(destinations ?? []).length} destinations)
        </Link>
        {(destinations ?? []).map((d) => (
          <Link
            key={d.id}
            href={`/setup/universities?destination=${d.id}`}
            className={`rounded-full border px-3 py-1 text-xs ${destinationFilter === d.id ? "border-primary bg-primary text-primary-ink" : "border-border text-muted hover:text-ink"}`}
          >
            {d.display_name}
          </Link>
        ))}
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(universities ?? []).map((u) => (
          <div key={u.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-bg">
            <Link href={`/setup/universities/${u.id}`} className="flex flex-1 items-center gap-3 text-ink">
              <span>
                {u.name}
                <span className="text-muted">
                  {u.city ? ` · ${u.city}` : ""} · {one(u.destination)?.display_name}
                </span>
              </span>
              <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.type}</Badge>
            </Link>
            {isSuperAdmin && (
              <div className="flex items-center gap-1">
                <Link
                  href={`/setup/universities/${u.id}`}
                  title="Edit university"
                  aria-label="Edit university"
                  className="rounded p-1 text-muted hover:bg-bg hover:text-primary"
                >
                  ✏️
                </Link>
                <DeleteUniversityIcon id={u.id} name={u.name} />
              </div>
            )}
          </div>
        ))}
        {(!universities || universities.length === 0) && <p className="px-4 py-6 text-sm text-muted">No universities yet.</p>}
      </div>
    </div>
  );
}
