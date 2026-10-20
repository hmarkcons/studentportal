import { hasRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { readAll } from "@/lib/catalogueReads";
import { readFilters } from "@/lib/universitySearch";
import { Card } from "@/components/ui/Card";
import { NewUniversityForm } from "./NewUniversityForm";
import { ImportUniversitiesForm } from "./ImportUniversitiesForm";
import { ImportCatalogueForm } from "./ImportCatalogueForm";
import { UniversityBrowser, type BrowserUniversity } from "./UniversityBrowser";
import { getCurrentUser } from "@/lib/auth/currentUser";

export default async function UniversitiesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams;
  // The search, the destination, the type and the level, as the address
  // carries them — so Back, a reload or a shared link opens the same list.
  const initial = readFilters({ get: (name) => (typeof params[name] === "string" ? (params[name] as string) : null) });
  const supabase = await createClient();

  const user = await getCurrentUser();
  const [{ data: staffRow }, canExport, universities, { data: destinations }, { data: bodyRows }] = await Promise.all([
    supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle(),
    hasPermission("catalogue.export"),
    // Every university, filtered on the page as the search is typed. Paged:
    // there are 358 today, and PostgREST would stop at 1000 without a word.
    readAll((from, to) =>
      supabase
        .from("universities")
        .select("id, name, short_name, city, region, type, status, destination_id")
        .order("name")
        .order("id")
        .range(from, to)
        .returns<BrowserUniversity[]>()
    ),
    supabase.from("destinations").select("id, display_name, country, currency, track").order("display_name"),
    // For the new-university form's DSU picker, which offers only the bodies
    // that serve the chosen country.
    supabase.from("scholarship_bodies").select("id, name, region, destinations:scholarship_body_destinations(destination_id)"),
  ]);
  const isSuperAdmin = hasRole(staffRow, "super_admin");
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

      <UniversityBrowser
        universities={universities}
        destinations={(destinations ?? []).map((d) => ({ id: d.id as string, name: d.display_name as string, country: (d.country as string | null) ?? null }))}
        initial={initial}
        canExport={canExport}
        canEdit={isSuperAdmin}
      />
    </div>
  );
}
