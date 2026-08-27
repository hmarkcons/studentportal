import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { listTrackerDefinitions, listTrackerCountries } from "@/lib/actions/countryTracker";
import { NewTrackerFieldForm, TrackerFieldRow } from "./TrackerFieldForm";
import { NewCountryForm } from "./NewCountryForm";

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

      <div className="flex flex-col gap-6">
        {countries.map((code) => (
          <Card key={code}>
            <h3 className="mb-3 text-sm font-medium text-ink">
              {nameByCode.get(code) ?? code} <span className="text-xs text-muted">({code})</span>
            </h3>
            <div className="flex flex-col">
              {(defsByCountry[code] ?? []).map((f) => (
                <TrackerFieldRow key={f.id} field={f} />
              ))}
              {(defsByCountry[code] ?? []).length === 0 && <p className="py-2 text-sm text-muted">No fields yet.</p>}
            </div>
            {isSuperAdmin && (
              <div className="mt-3">
                <NewTrackerFieldForm countryCode={code} />
              </div>
            )}
          </Card>
        ))}
        {countries.length === 0 && <p className="text-sm text-muted">No document trackers configured yet.</p>}
      </div>
    </div>
  );
}
