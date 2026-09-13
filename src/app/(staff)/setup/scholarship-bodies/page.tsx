import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScholarshipBodyForm, type ScholarshipBody, type DestinationChoice } from "./ScholarshipBodyForm";
import { currentAcademicYear, guideFreshness } from "@/lib/academicYear";
import { DeleteScholarshipBodyButton } from "./DeleteScholarshipBodyButton";

export default async function ScholarshipBodiesPage() {
  const { supabase } = await getStaffSession();
  // scholarships.manage, not role === "super_admin". The page has always told
  // Processing they could edit this directory; only Super Admin was ever shown
  // the controls, and creating a body needed no permission at all.
  const canManage = await hasPermission("scholarships.manage");

  const [{ data: bodies }, { data: destinations }, { data: links }] = await Promise.all([
    supabase
      .from("scholarship_bodies")
      .select(
        "id, name, region, academic_year, covers, stipend_amount, source_url, last_updated_year, apply_url, application_deadline, isee_threshold, ispe_threshold, benefits, call_status, call_expected_on, call_notes, call_pdf_url, guide_sections, guide_updated_at"
      )
      .order("name"),
    supabase
      .from("destinations")
      .select("id, display_name, country, scholarship_access")
      .eq("status", "active")
      .order("country"),
    supabase.from("scholarship_body_destinations").select("scholarship_body_id, destination_id"),
  ]);

  const destById = new Map((destinations ?? []).map((d) => [d.id, d]));
  const destIdsByBody = new Map<string, string[]>();
  for (const l of links ?? []) {
    destIdsByBody.set(l.scholarship_body_id, [...(destIdsByBody.get(l.scholarship_body_id) ?? []), l.destination_id]);
  }

  // One row per country name, not per destination: Italy exists twice here
  // (public and private are separate destinations) and a body serves the
  // country, so "Italy, Italy" would be the only thing that changed.
  const countryNames = (bodyId: string) => {
    const names = (destIdsByBody.get(bodyId) ?? [])
      .map((id) => destById.get(id)?.country)
      .filter((c): c is string => Boolean(c));
    return [...new Set(names)].sort();
  };

  const rows = (bodies ?? []).map((b) => {
    const countries = countryNames(b.id);
    return {
      id: b.id,
      countries,
      freshness: guideFreshness(b.academic_year),
      sectionCount: Array.isArray(b.guide_sections) ? b.guide_sections.length : 0,
      body: {
        id: b.id,
        name: b.name,
        region: b.region,
        academic_year: b.academic_year,
        covers: b.covers ?? [],
        stipend_amount: b.stipend_amount,
        source_url: b.source_url,
        destinationIds: destIdsByBody.get(b.id) ?? [],
        apply_url: b.apply_url,
        application_deadline: b.application_deadline,
        isee_threshold: b.isee_threshold,
        ispe_threshold: b.ispe_threshold,
        benefits: b.benefits,
        call_status: b.call_status ?? "published",
        call_expected_on: b.call_expected_on,
        call_notes: b.call_notes,
        call_pdf_url: b.call_pdf_url,
        guide_sections: Array.isArray(b.guide_sections) ? (b.guide_sections as { title: string; body: string }[]) : [],
      } satisfies ScholarshipBody,
    };
  });

  const destinationChoices: DestinationChoice[] = (destinations ?? []).map((d) => ({
    id: d.id,
    display_name: d.display_name,
    country: d.country,
  }));

  const universal = (destinations ?? []).filter((d) => d.scholarship_access === "universal").map((d) => d.country);

  // The year everything on this page is measured against. Computed, not
  // stored: it turns over in May on its own, and a stored one is a thing
  // somebody has to remember to change.
  const thisYear = currentAcademicYear();
  const stale = rows.filter((r) => r.freshness.state === "stale");
  const awaiting = rows.filter((r) => r.body.call_status === "awaiting");
  const noGuide = rows.filter((r) => r.sectionCount === 0);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Scholarship Body Directory</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            The bodies that award the scholarships tracked on a student&rsquo;s Scholarship tab, by country.
            &ldquo;Covers&rdquo; lists the universities a body pays for, and is what maps a student&rsquo;s university
            to its body.
          </p>
        </div>
        {canManage && (
          <ScholarshipBodyForm
            destinations={destinationChoices}
            trigger={<Button type="button" variant="primary">+ Scholarship body</Button>}
          />
        )}
      </div>

      {/* Which countries every student is offered a scholarship for, and which
          are put forward one student at a time. Set per destination in Setup,
          because it is the difference between Italy's DSU — a right — and
          France's Eiffel, which takes thirty students in the world. */}
      <p className="mb-4 text-xs text-muted">
        {universal.length > 0 ? (
          <>
            Every registered student is offered a scholarship for{" "}
            <strong className="font-medium text-ink">{[...new Set(universal)].join(", ")}</strong>. Everywhere else a
            scholarship is opened for one student at a time, on merit.
          </>
        ) : (
          <>Scholarships are opened for one student at a time. Mark a country universal in Setup &rsaquo; Destinations
            if every student there is entitled to one.</>
        )}
      </p>

      {/* Three different reasons a body might need attention, kept apart
          because they call for different things. A stale guide is work; a
          call that is not published is the calendar; a body with no guide at
          all has never been written up. */}
      {(stale.length > 0 || awaiting.length > 0 || noGuide.length > 0) && (
        <div className="mb-4 flex flex-col gap-1 rounded-md border border-border bg-bg px-3 py-2 text-xs">
          <p className="font-medium text-ink">Academic year {thisYear}</p>
          {stale.length > 0 && (
            <p className="text-warning">
              {stale.length} {stale.length === 1 ? "guide still describes" : "guides still describe"} an earlier year:{" "}
              {stale.map((r) => r.body.name).join(", ")}.
            </p>
          )}
          {awaiting.length > 0 && (
            <p className="text-info">
              {awaiting.length} waiting on {awaiting.length === 1 ? "its region" : "their regions"} to publish the call:{" "}
              {awaiting.map((r) => r.body.name).join(", ")}.
            </p>
          )}
          {noGuide.length > 0 && (
            <p className="text-muted">
              {noGuide.length} {noGuide.length === 1 ? "body has" : "bodies have"} no guide written up yet:{" "}
              {noGuide.map((r) => r.body.name).join(", ")}.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState>No scholarship bodies added yet.</EmptyState>
        </Card>
      ) : (
        <DataTable
          oneLine
          searchable
          searchPlaceholder="Search body, country, region or university…"
          exportFilename="scholarship-bodies"
          minTableWidthClassName="min-w-[1200px]"
          filters={[
            {
              key: "country",
              label: "Country",
              options: [...new Set(rows.flatMap((r) => r.countries))].sort(),
            },
          ]}
          columns={[
            { key: "country", header: "Country" },
            { key: "body", header: "Body" },
            { key: "region", header: "Region" },
            { key: "covers", header: "Covers" },
            { key: "academic_year", header: "Academic year" },
            { key: "deadline", header: "Deadline" },
            { key: "guide", header: "Guide" },
            { key: "stipend", header: "Stipend / notes" },
            { key: "source", header: "Source" },
            { key: "actions", header: "", exportable: false },
          ]}
          rows={rows.map((r) => ({
            id: r.id,
            cells: {
              country:
                r.countries.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {r.countries.map((c) => (
                      <Badge key={c} tone="primary">
                        {c}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  // Only reachable if a destination was deleted out from
                  // under it — a body with no country is offered to nobody.
                  <Badge tone="danger">No country</Badge>
                ),
              body: <span className="font-medium text-ink">{r.body.name}</span>,
              region: r.body.region ?? "—",
              covers: r.body.covers.join(", ") || "—",
              academic_year: (
                <span className="whitespace-nowrap">
                  {r.body.academic_year}
                  {/* Goes stale on its own the day the year turns in May —
                      nobody has to remember to mark it. */}
                  {r.freshness.state === "stale" && (
                    <Badge tone="warning" >
                      needs {r.freshness.expected}
                    </Badge>
                  )}
                </span>
              ),
              deadline:
                r.body.call_status === "awaiting" ? (
                  <Badge tone="info">
                    call not out{r.body.call_expected_on ? ` · expected ${r.body.call_expected_on}` : ""}
                  </Badge>
                ) : (
                  (r.body.application_deadline ?? "—")
                ),
              guide: r.sectionCount > 0 ? `${r.sectionCount} sections` : <Badge tone="warning">none yet</Badge>,
              stipend: r.body.stipend_amount ?? "—",
              source: r.body.source_url ? (
                <a
                  href={r.body.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                  title={r.body.source_url}
                >
                  🔗 View source
                </a>
              ) : (
                "—"
              ),
              actions: canManage ? (
                <span className="flex items-center gap-1">
                  <ScholarshipBodyForm
                    body={r.body}
                    destinations={destinationChoices}
                    trigger={
                      <button type="button" title="Edit" className="rounded p-1 text-muted hover:text-primary">
                        ✏️
                      </button>
                    }
                  />
                  <DeleteScholarshipBodyButton id={r.body.id} name={r.body.name} />
                </span>
              ) : null,
            },
            csv: {
              country: r.countries.join(", "),
              body: r.body.name,
              region: r.body.region ?? "",
              covers: r.body.covers.join(", "),
              academic_year: r.body.academic_year,
              deadline: r.body.application_deadline ?? "",
              guide: String(r.sectionCount),
              stipend: r.body.stipend_amount ?? "",
              source: r.body.source_url ?? "",
            },
          }))}
        />
      )}
    </div>
  );
}
