import { createClient } from "@/lib/supabase/server";
import { TrackerOrderBoard } from "./TrackerOrderBoard";
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
        from the fields below.{" "}
        {isSuperAdmin
          ? "Add, edit, or delete fields for any country, and drag the ⠿ handle — or use the arrows — to reorder the trackers and the fields inside them."
          : "Only Super Admin can edit these."}
      </p>

      {isSuperAdmin && <NewCountryForm />}

      {/* One card per country, all shut on every open and refresh, nothing
          remembered — the same rule as everywhere else in the app. Nine
          countries at up to twenty-one fields each made this a page you
          scrolled rather than read.

          The order of the trackers and of the fields inside them is set by
          dragging or by the arrows; it used to mean typing a number into a
          "sort order" box on each field, one field at a time. */}
      {countries.length === 0 ? (
        <EmptyState>No document trackers configured yet.</EmptyState>
      ) : (
        <TrackerOrderBoard
          canEdit={isSuperAdmin}
          countries={countries.map((code) => {
            const fields = defsByCountry[code] ?? [];
            return {
              code,
              name: nameByCode.get(code) ?? code,
              fieldCount: fields.length,
              hasFinalizedUniversity: fields.some((f) => f.isFinalizedUniversity),
              fields: fields.map((f) => ({
                id: f.id!,
                label: f.label,
                content: <TrackerFieldRow field={f} />,
              })),
              addForm: isSuperAdmin ? (
                <div className="mt-3">
                  <NewTrackerFieldForm countryCode={code} />
                </div>
              ) : null,
            };
          })}
        />
      )}
    </div>
  );
}
