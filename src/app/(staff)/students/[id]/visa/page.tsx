import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CredentialField } from "@/components/CredentialField";
import { CountryTrackerForm } from "@/components/CountryTrackerForm";
import { listTrackerDefinitions, listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { readVisaDecision, visaMessage } from "@/lib/visaOutcome";
import { visaCountries, type VisaApplication } from "@/lib/visaCountries";
import { canSeeVisaSection } from "@/lib/visaAccess";
import { VisaOfficeList } from "@/components/VisaOfficeList";
import { loadVisaOffices } from "@/lib/actions/visaOfficeQueries";
import { loadVisaPageContent } from "@/lib/actions/visaPageQueries";
import { VisaPageSections } from "@/components/VisaPageSections";
import { mergeVisaMessages, sectionsFor, toMessageTemplates } from "@/lib/visaPage";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * The visa process, for the two roles that own it.
 *
 * There is no separate visa record anywhere in this system: every field here
 * is a documentation-tracker field that somebody opted in to the visa view in
 * Setup, which is why a country added later needs no code change. What this
 * page adds over the tracker on the Dashboard is a single place that shows
 * only the visa, alongside the two things that live elsewhere — the
 * appointment login and the message the student is currently reading.
 *
 * Editable, not a mirror: saveTrackerFields writes only the keys it is handed,
 * so a form carrying just the visa fields cannot touch the rest of the
 * tracker. Anything not opted in stays on the Dashboard, which remains the
 * place the whole tracker is maintained.
 */
export default async function StudentVisaTab(props: PageProps<"/students/[id]/visa">) {
  const { id } = await props.params;
  const { supabase, staff } = await getStaffSession();

  // The tab is hidden for everybody else, but a hidden tab is not a
  // permission — the URL is guessable and this page carries a student's
  // refusal history and their appointment portal login.
  if (!canSeeVisaSection(staff?.role)) {
    return (
      <Card>
        <EmptyState>
          The visa section is kept to the Super Admin and the Processing team. Ask one of them if you need something from
          it.
        </EmptyState>
      </Card>
    );
  }

  const client = supabase ?? (await createClient());
  const revalidateTo = `/students/${id}/visa`;

  const [{ data: student }, { data: applications }] = await Promise.all([
    client.from("students").select("id, full_name").eq("id", id).maybeSingle(),
    client
      .from("applications")
      .select("id, is_finalized, university:universities(name, destination:destinations(id, country_code, display_name))")
      .eq("student_id", id),
  ]);

  const rows: VisaApplication[] = (applications ?? []).map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { id?: string; country_code?: string; display_name?: string } | null)
      : null;
    return {
      id: a.id,
      isFinalized: Boolean(a.is_finalized),
      countryCode: dest?.country_code ?? null,
      countryName: dest?.display_name ?? null,
      destinationId: dest?.id ?? null,
      universityName: uni?.name ?? null,
    };
  });

  // The same rule the student's own page applies, shared so the two cannot
  // disagree about whose visa is under way.
  const countries = visaCountries(rows);
  const defsByCountry = countries.length ? await listTrackerDefinitions(countries.map((c) => c.code)) : {};
  const destinationIds = countries.map((c) => c.destinationId).filter((d): d is string => Boolean(d));
  const officesByDestination = await loadVisaOffices(destinationIds);
  // The sections and per-country wording set in Setup > Visa page builder.
  const built = await loadVisaPageContent(destinationIds);

  const sections = await Promise.all(
    countries.map(async (c) => {
      const fields = (defsByCountry[c.code] ?? []).filter((f) => f.showOnStudentVisa);
      if (fields.length === 0) return null;

      const { data: extras } = await client
        .from("application_country_extra")
        .select("field_key, field_value")
        .eq("application_id", c.appId);
      const values: Record<string, string> = {};
      for (const e of extras ?? []) values[e.field_key] = e.field_value ?? "";

      const outcomeField = fields.find((f) => f.visaRole === "outcome");
      const reasonField = fields.find((f) => f.visaRole === "outcome_reason");
      return {
        country: c,
        fields,
        values,
        decision: readVisaDecision(outcomeField ? values[outcomeField.key] : null),
        reason: reasonField ? values[reasonField.key] ?? "" : "",
        // What the student is reading right now, before anybody changes it.
        anythingRecorded: fields.some((f) => (values[f.key] ?? "").trim() !== ""),
      };
    })
  );
  const visible = sections.filter((s): s is NonNullable<typeof s> => s !== null);

  // The appointment login, found the same way the student's page finds it: the
  // preset first, then anything typed by hand before the preset existed.
  const credentialTypes = await listCredentialTypesAction("student", id);
  const appointmentLogin =
    credentialTypes.find((t) => t === "visa_appointment_portal") ??
    credentialTypes.find((t) => t !== "portal_login" && /vfs|appointment|visa/i.test(t)) ??
    null;

  // The shared wording comes from loadVisaPageContent and is merged per
  // country below, so this page no longer reads visa_messages itself.

  return (
    <div className="flex flex-col gap-6">
      {visible.length === 0 ? (
        <Card>
          <EmptyState>
            No visa process yet. It begins once a university is finalised on the Applications tab — until then there is
            nothing for a consulate to see.
          </EmptyState>
        </Card>
      ) : (
        visible.map((s) => {
          const message = visaMessage(
            s.decision,
            student?.full_name ?? "",
            s.country.name,
            toMessageTemplates(
              mergeVisaMessages(built.shared, s.country.destinationId ? built.overrides[s.country.destinationId] ?? null : null)
            )
          );
          const extraSections = sectionsFor(built.sections, s.country.destinationId, "staff");
          return (
            <Card key={s.country.code}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-ink">{s.country.name}</h3>
                  {s.country.universities.length > 0 && (
                    <p className="text-xs text-muted">{s.country.universities.join(" · ")}</p>
                  )}
                </div>
                <Badge tone={s.decision === "approved" ? "success" : s.decision === "refused" ? "danger" : "warning"}>
                  {s.decision === "approved" ? "Visa approved" : s.decision === "refused" ? "Not successful" : "In progress"}
                </Badge>
              </div>

              {/* Said plainly, because the difference matters before anybody
                  changes a decision: nothing here is visible to the student
                  until something is recorded, and once it is, they read the
                  message below word for word. */}
              {!s.anythingRecorded ? (
                <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                  Nothing recorded yet, so the student&rsquo;s own Visa page shows them nothing for {s.country.name}.
                </p>
              ) : (
                message && (
                  <div
                    className={`mb-4 rounded-md p-3 ${s.decision === "approved" ? "bg-success-bg" : "bg-warning-bg"}`}
                  >
                    <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                      What the student is reading now
                    </p>
                    <p className={`text-sm font-medium ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                      {message.heading}
                    </p>
                    {message.body.map((para) => (
                      <p key={para} className={`mt-1 text-xs ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                        {para}
                      </p>
                    ))}
                    {s.decision === "refused" && s.reason && (
                      <p className="mt-2 text-xs text-warning">Reason given: {s.reason}</p>
                    )}
                  </div>
                )
              )}

              {/* Where the application actually goes. Above the tracker
                  because it is what a counselor is asked for on the phone,
                  and the tracker is what they fill in afterwards. */}
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Where to apply &mdash; {s.country.name}
                </p>
                <VisaOfficeList
                  offices={s.country.destinationId ? officesByDestination[s.country.destinationId] ?? [] : []}
                  countryName={s.country.name}
                  showProvenance
                />
              </div>

              <CountryTrackerForm
                applicationId={s.country.appId}
                fields={s.fields}
                values={s.values}
                revalidateTo={revalidateTo}
                studentId={id}
              />

              {/* Whatever the office added in the builder, staff-only ones
                  included — those are the notes a counselor needs and the
                  student should not read. */}
              {extraSections.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <VisaPageSections sections={extraSections} showAudience />
                </div>
              )}

              <p className="mt-3 text-xs text-muted">
                These are the tracker fields marked for the visa view. The rest of {s.country.name}&rsquo;s tracker is on
                the{" "}
                <Link href={`/students/${id}`} className="text-primary hover:underline">
                  Dashboard
                </Link>
                . What appears on this page is built in{" "}
                <Link href="/setup/visa-page-builder" className="text-primary hover:underline">
                  Setup &rsaquo; Visa page builder
                </Link>
                .
              </p>
            </Card>
          );
        })
      )}

      <Card>
        <h3 className="mb-1 text-sm font-medium text-ink">Visa appointment portal</h3>
        <p className="mb-3 text-xs text-muted">
          The student&rsquo;s own login, recorded here so the office can book on their behalf. Encrypted, shown only when
          somebody asks for it, and visible to the student on their own Visa page so they need not ring up for their own
          password.
        </p>
        <CredentialField
          label={appointmentLogin && appointmentLogin !== "visa_appointment_portal" ? appointmentLogin.replace(/_/g, " ") : "Appointment portal login"}
          ownerType="student"
          ownerId={id}
          credentialType={appointmentLogin ?? "visa_appointment_portal"}
          revalidateTo={revalidateTo}
        />
      </Card>
    </div>
  );
}
