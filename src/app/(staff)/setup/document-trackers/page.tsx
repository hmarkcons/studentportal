import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { listTrackerDefinitions, listTrackerCountries } from "@/lib/actions/countryTracker";
import { NewTrackerFieldForm, TrackerFieldRow } from "./TrackerFieldForm";
import { NewCountryForm } from "./NewCountryForm";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DocumentTrackersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const countries = await listTrackerCountries();
  const defsByCountry = await listTrackerDefinitions(countries);

  const { data: destinations } = await supabase.from("destinations").select("country_code, display_name");
  const nameByCode = new Map((destinations ?? []).map((d) => [d.country_code, d.display_name]));

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Document Trackers</h2>
      <p className="mb-4 text-sm text-muted">
        Each country&apos;s documentation tracker (shown on a registered student&apos;s dashboard, once they have an application there) is built
        from the fields below. {isSuperAdmin ? "Add, edit, or delete fields for any country." : "Only Super Admin can edit these."}
      </p>

      {isSuperAdmin && <NewCountryForm />}

      {/* One card per country, all shut on every open and refresh, nothing
          remembered — the same rule as everywhere else in the app. Nine
          countries at up to twenty-one fields each made this a page you
          scrolled rather than read. */}
      <div className="flex flex-col gap-4">
        {countries.map((code) => {
          const fields = defsByCountry[code] ?? [];
          const hasFinalizedUniversity = fields.some((f) => f.isFinalizedUniversity);
          return (
            <CollapsibleCard
              key={code}
              id={`tracker-${code}`}
              title={nameByCode.get(code) ?? code}
              subtitle={code}
              badge={
                <span className="flex flex-wrap items-center gap-2">
                  {/* A tracker with no field recording the finalised
                      university cannot do the one thing every country's
                      tracker has to, so it is worth seeing without opening
                      the card. */}
                  {!hasFinalizedUniversity && <Badge tone="danger">No finalised-university field</Badge>}
                  <Badge tone={fields.length === 0 ? "warning" : "neutral"}>
                    {fields.length} {fields.length === 1 ? "field" : "fields"}
                  </Badge>
                </span>
              }
            >
              <div className="flex flex-col">
                {fields.map((f) => (
                  <TrackerFieldRow key={f.id} field={f} />
                ))}
                {fields.length === 0 && <p className="py-2 text-sm text-muted">No fields yet.</p>}
              </div>
              {isSuperAdmin && (
                <div className="mt-3">
                  <NewTrackerFieldForm countryCode={code} />
                </div>
              )}
            </CollapsibleCard>
          );
        })}
        {countries.length === 0 && <EmptyState>No document trackers configured yet.</EmptyState>}
      </div>
    </div>
  );
}
