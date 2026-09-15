import { Badge } from "@/components/ui/Badge";
import { kindLabel, orderOffices, whereToApply, needsChecking, type VisaOffice } from "@/lib/visaOffices";

function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-xs text-muted sm:w-28">{label}</span>
      <span className="min-w-0 break-words text-sm text-ink">{value}</span>
    </div>
  );
}

function LinkLine({ label, href }: { label: string; href: string | null }) {
  if (!href) return null;
  let shown = href;
  try {
    shown = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL somebody could open; show what was typed rather than nothing.
  }
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-xs text-muted sm:w-28">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="min-w-0 break-words text-sm text-primary hover:underline">
        {shown} &rarr;
      </a>
    </div>
  );
}

/**
 * Where a student hands in their visa application, and how to reach the place.
 *
 * Shown to staff and to the student, from the same table, because the address
 * a counselor reads out on the phone and the one the student turns up to on
 * the morning have to be the same address.
 *
 * `showProvenance` is for the staff side only: a student does not need to know
 * which entries the office has confirmed against the source, but staff do
 * before they read one out.
 */
export function VisaOfficeList({
  offices,
  countryName,
  showProvenance = false,
}: {
  offices: VisaOffice[];
  countryName: string;
  showProvenance?: boolean;
}) {
  if (offices.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
        No embassy, consulate or visa centre recorded for {countryName} yet
        {showProvenance ? " — add one in Setup › Visa offices." : "; your counsellor can tell you where to go."}
      </p>
    );
  }

  const ordered = orderOffices(offices);
  const summary = whereToApply(ordered);

  return (
    <div className="flex flex-col gap-3">
      {/* The answer, before the addresses. A student reading a list of three
          offices should not have to work out which one is theirs. */}
      {summary && (
        <p className="rounded-md border border-primary bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3 py-2 text-sm font-medium text-ink">
          {summary}
        </p>
      )}

      {ordered.map((o) => (
        <div key={o.id} className="rounded-md border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{o.name}</span>
            <Badge tone="neutral">{kindLabel(o.kind)}</Badge>
            {o.submitsApplications && <Badge tone="success">Applications submitted here</Badge>}
            {showProvenance && needsChecking(o) && <Badge tone="warning">Not yet confirmed</Badge>}
          </div>

          <div className="flex flex-col gap-1">
            <Line label="City" value={o.city} />
            <Line label="Address" value={o.address} />
            <Line label="Phone" value={o.phone} />
            {o.email && (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <span className="shrink-0 text-xs text-muted sm:w-28">Email</span>
                <a href={`mailto:${o.email}`} className="min-w-0 break-words text-sm text-primary hover:underline">
                  {o.email}
                </a>
              </div>
            )}
            <Line label="Hours" value={o.officeHours} />
            <Line label="Covers" value={o.jurisdiction} />
            <LinkLine label="Website" href={o.website} />
            <LinkLine label="Appointments" href={o.appointmentUrl} />
            {o.notes && <p className="mt-1 text-xs text-muted">{o.notes}</p>}
            {/* Staff only: where this came from, so a wrong address can be
                rechecked against the same page it was taken from. */}
            {showProvenance && o.sourceUrl && <LinkLine label="Source" href={o.sourceUrl} />}
          </div>
        </div>
      ))}

      {showProvenance && ordered.some(needsChecking) && (
        <p className="text-xs text-muted">
          Entries marked <span className="font-medium">Not yet confirmed</span> have not been checked against the
          official source. Confirm or correct them in Setup &rsaquo; Visa offices before reading one out to a student.
        </p>
      )}
    </div>
  );
}
