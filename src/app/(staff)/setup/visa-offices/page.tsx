import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { VisaOfficeForm } from "./VisaOfficeForm";
import { OfficeRow } from "./OfficeRow";
import { orderOffices, type VisaOffice, type VisaOfficeKind } from "@/lib/visaOffices";

export const dynamic = "force-dynamic";

/**
 * The embassy, consulate and visa-centre directory, by destination.
 *
 * Grouped by country because that is how it is maintained — somebody sits down
 * with one country's official page open and fixes everything on it — and every
 * country is listed even with nothing recorded, so a gap is visible rather
 * than being something you have to notice is missing.
 */
export default async function VisaOfficesSetupPage() {
  const supabase = await createClient();
  const canEdit = await hasPermission("settings.visa_offices");

  const [{ data: destinations }, { data: offices }] = await Promise.all([
    supabase.from("destinations").select("id, display_name, country").eq("status", "active").order("display_name"),
    supabase
      .from("visa_offices")
      .select(
        "id, destination_id, kind, name, city, operator, address, phone, email, website, appointment_url, office_hours, jurisdiction, submits_applications, notes, source_url, verified_at, status"
      )
      .order("sort_order"),
  ]);

  const toOffice = (r: NonNullable<typeof offices>[number]): VisaOffice => ({
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
  });

  const activeBy = new Map<string, VisaOffice[]>();
  const archivedBy = new Map<string, VisaOffice[]>();
  for (const r of offices ?? []) {
    const target = r.status === "archived" ? archivedBy : activeBy;
    const list = target.get(r.destination_id) ?? [];
    list.push(toOffice(r));
    target.set(r.destination_id, list);
  }

  const totalUnconfirmed = (offices ?? []).filter((r) => r.status !== "archived" && !r.verified_at).length;

  return (
    <div className="w-full max-w-5xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Visa offices</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        The embassies, consulates and visa application centres shown on a student&rsquo;s Visa page and on the staff Visa
        tab. One entry per office, with the place applications are actually lodged ticked &mdash; that tick is what the
        student&rsquo;s page turns into &ldquo;applications are submitted at &hellip;&rdquo;.
      </p>

      {totalUnconfirmed > 0 && (
        <p className="mb-4 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
          {totalUnconfirmed} {totalUnconfirmed === 1 ? "entry has" : "entries have"} not been confirmed against their
          source. Staff see them marked as unconfirmed until somebody checks them.
        </p>
      )}

      {!canEdit && (
        <p className="mb-4 text-xs text-muted">
          You can read the directory. Only Management and Super Admin can change it.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {(destinations ?? []).map((d) => {
          const active = orderOffices(activeBy.get(d.id) ?? []);
          const archived = archivedBy.get(d.id) ?? [];
          return (
            <Card key={d.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{d.display_name}</h3>
                  {active.length === 0 ? (
                    <Badge tone="warning">Nothing recorded</Badge>
                  ) : (
                    <span className="text-xs text-muted">
                      {active.length} {active.length === 1 ? "office" : "offices"}
                    </span>
                  )}
                  {active.length > 0 && !active.some((o) => o.submitsApplications) && (
                    <Badge tone="warning">Nowhere marked for applications</Badge>
                  )}
                </div>
                {canEdit && (
                  <VisaOfficeForm
                    destinationId={d.id}
                    destinationName={d.display_name}
                    trigger={
                      <Button type="button" variant="outline" size="sm">
                        + Add an office
                      </Button>
                    }
                  />
                )}
              </div>

              {active.length === 0 ? (
                <p className="text-xs text-muted">
                  No embassy, consulate or visa centre on file. A student going to {d.country} sees nothing about where
                  to apply.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {active.map((o) => (
                    <OfficeRow key={o.id} office={o} destinationId={d.id} destinationName={d.display_name} canEdit={canEdit} />
                  ))}
                </div>
              )}

              {archived.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted">
                    {archived.length} archived
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 opacity-70">
                    {archived.map((o) => (
                      <OfficeRow
                        key={o.id}
                        office={o}
                        destinationId={d.id}
                        destinationName={d.display_name}
                        archived
                        canEdit={canEdit}
                      />
                    ))}
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
