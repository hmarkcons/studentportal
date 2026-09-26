import { hasRole } from "@/lib/auth/roles";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewUniversityForm } from "./NewUniversityForm";
import { ImportUniversitiesForm } from "./ImportUniversitiesForm";
import { ImportCatalogueForm } from "./ImportCatalogueForm";
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
  const { data: staffRow } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = hasRole(staffRow, "super_admin");

  let query = supabase
    .from("universities")
    .select("id, name, city, type, status, destination_id, destination:destinations(display_name)")
    .order("name");
  if (destinationFilter) query = query.eq("destination_id", destinationFilter);
  const { data: universities } = await query;

  const [{ data: destinations }, { data: bodyRows }] = await Promise.all([
    supabase.from("destinations").select("id, display_name, currency, track").order("display_name"),
    // For the new-university form's DSU picker, which offers only the bodies
    // that serve the chosen country.
    supabase.from("scholarship_bodies").select("id, name, region, destinations:scholarship_body_destinations(destination_id)"),
  ]);
  const bodies = (bodyRows ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    region: (b.region as string | null) ?? null,
    destinationIds: ((b.destinations ?? []) as { destination_id: string }[]).map((d) => d.destination_id),
  }));

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Universities</h2>
      <Card className="mb-6">
        <NewUniversityForm destinations={destinations ?? []} bodies={bodies} />
        {/* Importing is a Super Admin's alone — the actions refuse anyone else
            too; hiding the forms just saves them finding that out. */}
        {isSuperAdmin && (
          <>
            <ImportUniversitiesForm destinations={destinations ?? []} />
            {/* The combined sheet. Listed after the universities-only one
                because it is the bigger hammer: it can create and update
                programmes too. */}
            <ImportCatalogueForm destinations={destinations ?? []} />
          </>
        )}
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
        {(!universities || universities.length === 0) && (
          <div className="px-4 py-6">
            <EmptyState>No universities yet.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
