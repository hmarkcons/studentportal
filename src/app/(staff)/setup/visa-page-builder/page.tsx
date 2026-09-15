import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DestinationPicker } from "./DestinationPicker";
import { SectionForm } from "./SectionForm";
import { SectionRow } from "./SectionRow";
import { MessageOverrideForm } from "./MessageOverrideForm";
import { VisaOfficeForm } from "../visa-offices/VisaOfficeForm";
import { OfficeRow } from "../visa-offices/OfficeRow";
import { orderOffices, type VisaOffice, type VisaOfficeKind } from "@/lib/visaOffices";
import { hasMessageOverride, type VisaMessageFields, type VisaPageSection } from "@/lib/visaPage";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";

export const dynamic = "force-dynamic";

/**
 * Everything a student's Visa page is made of, in one place.
 *
 * The page is assembled from four kinds of block, and until now each was
 * maintained somewhere different — the offices in their own Setup page, the
 * decision message in another, the tracker fields in a third, and anything
 * else nowhere at all. This lists them in the order they appear on the page
 * so somebody can see what a student will actually read, and change it.
 *
 * One builder covering every destination rather than one per country: a
 * country added next year gets the shared sections without anybody
 * remembering to copy them across.
 */
export default async function VisaPageBuilder({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination } = await searchParams;
  const supabase = await createClient();
  const canEdit = await hasPermission("settings.visa_page");

  const [{ data: destinations }, { data: sectionRows }, { data: officeRows }, { data: shared }] = await Promise.all([
    supabase.from("destinations").select("id, display_name, country_code").eq("status", "active").order("display_name"),
    supabase
      .from("visa_page_sections")
      .select("id, destination_id, title, body, link_label, link_url, audience, sort_order, status")
      .order("sort_order"),
    supabase
      .from("visa_offices")
      .select(
        "id, destination_id, kind, name, city, operator, address, phone, email, website, appointment_url, office_hours, jurisdiction, submits_applications, notes, source_url, verified_at, status"
      )
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("visa_messages")
      .select("approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff")
      .eq("id", true)
      .maybeSingle(),
  ]);

  const toSection = (r: NonNullable<typeof sectionRows>[number]): VisaPageSection => ({
    id: r.id,
    destinationId: r.destination_id,
    title: r.title,
    body: r.body,
    linkLabel: r.link_label,
    linkUrl: r.link_url,
    audience: r.audience as VisaPageSection["audience"],
    sortOrder: r.sort_order,
    status: r.status as VisaPageSection["status"],
  });

  const allSections = (sectionRows ?? []).map(toSection);
  const sharedSections = allSections.filter((s) => s.destinationId === null);

  // How much is on each country's page, so the picker shows where the gaps are.
  const blocksByDestination = new Map<string, number>();
  for (const s of allSections) if (s.destinationId) blocksByDestination.set(s.destinationId, (blocksByDestination.get(s.destinationId) ?? 0) + 1);
  for (const o of officeRows ?? []) blocksByDestination.set(o.destination_id, (blocksByDestination.get(o.destination_id) ?? 0) + 1);

  const chosen = (destinations ?? []).find((d) => d.id === destination) ?? null;

  const offices: VisaOffice[] = chosen
    ? orderOffices(
        (officeRows ?? [])
          .filter((r) => r.destination_id === chosen.id)
          .map((r) => ({
            id: r.id,
            kind: r.kind as VisaOfficeKind,
            name: r.name,
            city: r.city,
            operator: r.operator,
            address: r.address,
            phone: r.phone,
            email: r.email,
            website: r.website,
            appointmentUrl: r.appointment_url,
            officeHours: r.office_hours,
            jurisdiction: r.jurisdiction,
            submitsApplications: Boolean(r.submits_applications),
            notes: r.notes,
            sourceUrl: r.source_url,
            verifiedAt: r.verified_at,
          }))
      )
    : [];

  const { data: overrideRow } = chosen
    ? await supabase
        .from("visa_destination_messages")
        .select("approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff")
        .eq("destination_id", chosen.id)
        .maybeSingle()
    : { data: null };

  // Which tracker fields reach the visa page. Toggled in Document trackers —
  // listed here so the builder accounts for everything on the page, and links
  // out rather than offering a second place to change them.
  const defs = chosen ? await listTrackerDefinitions([chosen.country_code]) : {};
  const visaFields = chosen ? (defs[chosen.country_code] ?? []).filter((f) => f.showOnStudentVisa) : [];

  const countrySections = chosen ? allSections.filter((s) => s.destinationId === chosen.id) : [];

  return (
    <div className="w-full max-w-5xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Visa page builder</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Everything a student&rsquo;s Visa page is made of, in the order it appears. Sections added here show on the
        student&rsquo;s page and on the staff Visa tab; the offices and the decision message are the same records the
        other Setup pages edit, gathered here so nothing about the page is maintained out of sight.
      </p>

      {!canEdit && (
        <p className="mb-4 text-xs text-muted">You can read the builder. Only Management and Super Admin can change it.</p>
      )}

      {/* ------------------------------------------------ shared, every country */}
      <Card className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Shown on every country&rsquo;s visa page</h3>
            <p className="text-xs text-muted">
              Written once and shown everywhere, including countries added later. These appear above a country&rsquo;s
              own sections.
            </p>
          </div>
          {canEdit && (
            <SectionForm
              destinationId={null}
              scopeLabel="every destination"
              trigger={
                <Button type="button" variant="outline" size="sm">
                  + Add a shared section
                </Button>
              }
            />
          )}
        </div>
        {sharedSections.length === 0 ? (
          <p className="text-xs text-muted">Nothing shared yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sharedSections.map((s, i) => (
              <SectionRow
                key={s.id}
                section={s}
                scopeLabel="every destination"
                canEdit={canEdit}
                isFirst={i === 0}
                isLast={i === sharedSections.length - 1}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="mb-4">
        <DestinationPicker
          destinations={(destinations ?? []).map((d) => ({
            id: d.id,
            display_name: d.display_name,
            blocks: blocksByDestination.get(d.id) ?? 0,
          }))}
          selected={chosen?.id ?? ""}
        />
      </div>

      {!chosen ? (
        <Card>
          <p className="text-sm text-muted">Choose a destination above to build its visa page.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 1 — the message ------------------------------------------------ */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">1. The decision message</h3>
              <Badge tone={hasMessageOverride(overrideRow) ? "info" : "neutral"}>
                {hasMessageOverride(overrideRow) ? "Its own wording" : "Shared wording"}
              </Badge>
              <Link href="/setup/visa-messages" className="text-xs text-primary hover:underline">
                edit the shared wording &rarr;
              </Link>
            </div>
            <p className="mb-3 text-xs text-muted">
              What the student reads when their visa is approved or refused. Nothing is shown until a decision is
              recorded on their tracker.
            </p>
            <MessageOverrideForm
              destinationId={chosen.id}
              destinationName={chosen.display_name}
              shared={(shared as VisaMessageFields | null) ?? null}
              override={(overrideRow as VisaMessageFields | null) ?? null}
              hasOverride={hasMessageOverride(overrideRow)}
              canEdit={canEdit}
            />
          </Card>

          {/* 2 — where to apply --------------------------------------------- */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">2. Where to apply</h3>
                {offices.length === 0 ? (
                  <Badge tone="warning">Nothing recorded</Badge>
                ) : (
                  !offices.some((o) => o.submitsApplications) && <Badge tone="warning">Nowhere marked for applications</Badge>
                )}
              </div>
              {canEdit && (
                <VisaOfficeForm
                  destinationId={chosen.id}
                  destinationName={chosen.display_name}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      + Add an office
                    </Button>
                  }
                />
              )}
            </div>
            {offices.length === 0 ? (
              <p className="text-xs text-muted">
                No embassy, consulate or visa centre on file, so the page says nothing about where to apply.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {offices.map((o) => (
                  <OfficeRow key={o.id} office={o} destinationId={chosen.id} destinationName={chosen.display_name} canEdit={canEdit} />
                ))}
              </div>
            )}
          </Card>

          {/* 3 — the tracker fields ----------------------------------------- */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">3. Progress fields</h3>
              <Link href="/setup/document-trackers" className="text-xs text-primary hover:underline">
                choose which fields appear &rarr;
              </Link>
            </div>
            <p className="mb-2 text-xs text-muted">
              Tracker fields marked for the visa view. Staff fill these in on the student&rsquo;s Visa tab; the student
              reads them.
            </p>
            {visaFields.length === 0 ? (
              <p className="text-xs text-muted">
                No field is marked for {chosen.display_name}&rsquo;s visa view, so the page shows no progress at all.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {visaFields.map((f) => (
                  <Badge key={f.key} tone={f.visaRole ? "info" : "neutral"}>
                    {f.label}
                    {f.visaRole === "outcome" ? " · decision" : f.visaRole === "outcome_reason" ? " · reason" : ""}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          {/* 4 — this country's own sections -------------------------------- */}
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">4. {chosen.display_name}&rsquo;s own sections</h3>
              {canEdit && (
                <SectionForm
                  destinationId={chosen.id}
                  scopeLabel={chosen.display_name}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      + Add a section
                    </Button>
                  }
                />
              )}
            </div>
            <p className="mb-3 text-xs text-muted">
              Anything else this country&rsquo;s students need to be told — what to bring, how long the wait runs, that
              the centre has moved. Each one can be addressed to the student, to staff, or to both.
            </p>
            {countrySections.length === 0 ? (
              <p className="text-xs text-muted">Nothing yet for {chosen.display_name}.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {countrySections.map((s, i) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    scopeLabel={chosen.display_name}
                    canEdit={canEdit}
                    isFirst={i === 0}
                    isLast={i === countrySections.length - 1}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
