import { createClient } from "@/lib/supabase/server";
import { KeyRound, MapPin, PartyPopper, Stamp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import { listTrackerDefinitions, listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { formatDateOnly } from "@/lib/formatDate";
import { readVisaDecision, visaMessage } from "@/lib/visaOutcome";
import { VisaCredentials } from "./VisaCredentials";
import { VisaOfficeList } from "@/components/VisaOfficeList";
import { visaCountries } from "@/lib/visaCountries";
import { loadVisaOffices } from "@/lib/actions/visaOfficeQueries";
import { loadVisaPageContent } from "@/lib/actions/visaPageQueries";
import { VisaPageSections } from "@/components/VisaPageSections";
import { mergeVisaMessages, sectionsFor, toMessageTemplates } from "@/lib/visaPage";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** Date-only tracker values render as dates; everything else as written. */
function display(value: string, type: string | undefined) {
  if (!value) return "—";
  // Spelled-out month. A visa appointment is the one date on this page a
  // student cannot afford to misread, and 11/20/2026 reads as 11 December to
  // most of the world outside the US.
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateOnly(value, { day: "numeric", month: "short", year: "numeric" });
  }
  if (type === "boolean") return value === "true" ? "Yes" : value === "false" ? "No" : value;
  return value;
}

export default async function PortalVisaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();
  if (!student) return null;

  // Everything on this page comes from the documentation tracker — there is no
  // separate visa record. Which fields appear is opted in per field from
  // Setup › Document trackers, so a country added later needs no code change.
  const { data: applications } = await supabase
    .from("applications")
    .select("id, is_finalized, university:universities(name, destination:destinations(id, country_code, display_name))")
    .eq("student_id", student.id);

  // Which countries are actually in the visa process is decided in
  // visaCountries, shared with the staff Visa tab so the two cannot disagree
  // about whose visa is under way.
  const countries = visaCountries(
    (applications ?? []).map((a) => {
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
    })
  );

  const codes = countries.map((c) => c.code);
  const defsByCountry = codes.length ? await listTrackerDefinitions(codes) : {};
  // The same table the staff tab reads: the address a counsellor gives on the
  // phone and the one the student turns up to have to be the same address.
  const destinationIds = countries.map((c) => c.destinationId).filter((d): d is string => Boolean(d));
  const officesByDestination = await loadVisaOffices(destinationIds);
  // The sections and per-country wording set in Setup › Visa page builder.
  const built = await loadVisaPageContent(destinationIds);

  const sections = await Promise.all(
    countries.map(async (c) => {
      const fields = (defsByCountry[c.code] ?? []).filter((f) => f.showOnStudentVisa);
      // No early return on an empty list. A country can have no visa tracker
      // fields defined yet and still have an address to go to and sections
      // written in the builder — Ireland is exactly that, and returning here
      // made both silently unreachable however much had been written for it.
      // The combined test further down is the one that decides whether there
      // is anything worth showing.

      const { data: extras } = await supabase
        .from("application_country_extra")
        .select("field_key, field_value")
        .eq("application_id", c.appId);
      const values: Record<string, string> = {};
      for (const e of extras ?? []) values[e.field_key] = e.field_value ?? "";

      const outcomeField = fields.find((f) => f.visaRole === "outcome");
      const reasonField = fields.find((f) => f.visaRole === "outcome_reason");
      const decision = readVisaDecision(outcomeField ? values[outcomeField.key] : null);

      // A country whose fields are all still blank has nothing to say. A card
      // of dashes under an "In progress" badge tells a student less than the
      // empty state does — it reads as the page being broken rather than as
      // their visa process not having started.
      //
      // The addresses are the exception, and the reason the rule is now "or":
      // knowing which centre to go to is useful from the day a university is
      // finalised, and an address is not a dash.
      const anythingRecorded = fields.some((f) => (values[f.key] ?? "").trim() !== "");
      const offices = c.destinationId ? officesByDestination[c.destinationId] ?? [] : [];
      const extraSections = sectionsFor(built.sections, c.destinationId, "student");
      if (!anythingRecorded && offices.length === 0 && extraSections.length === 0) return null;

      return {
        country: c,
        // The decision and its reason are shown in the message, not repeated
        // as ordinary rows.
        rows: anythingRecorded
          ? fields.filter((f) => !f.visaRole).map((f) => ({ label: f.label, value: display(values[f.key] ?? "", f.type) }))
          : [],
        decision,
        reason: reasonField ? values[reasonField.key] ?? "" : "",
        anythingRecorded,
        offices,
        extraSections,
        // The shared wording with this country's own laid over it, field by
        // field, so an override that changes only a heading keeps the rest.
        messages: mergeVisaMessages(built.shared, c.destinationId ? built.overrides[c.destinationId] ?? null : null),
      };
    })
  );

  const visible = sections.filter((s): s is NonNullable<typeof s> => s !== null);

  // The visa appointment login is the student's own — staff record it so they
  // can book on the student's behalf, and read_credential has allowed a
  // student to read their own since it was written. What was missing was
  // anywhere for them to see it, so a student had to ask their counsellor for
  // their own password.
  //
  // The row is listed here and decrypted only when the student asks, in
  // VisaCredentials.
  const credentialTypes = await listCredentialTypesAction("student", student.id);
  // The preset first; then anything a staff member typed by hand before it
  // existed, so an older visa_portal or vfs_login is not stranded.
  const appointmentLogin =
    credentialTypes.find((t) => t === "visa_appointment_portal") ??
    // portal_login is this portal's own password, not a visa one.
    credentialTypes.find((t) => t !== "portal_login" && /vfs|appointment|visa/i.test(t)) ??
    null;

  // The shared wording is read once in loadVisaPageContent and merged per
  // country above, so this page no longer fetches visa_messages itself —
  // two reads of the same row was how the two could have disagreed.

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={Stamp}
        title="Visa"
        description="Your visa progress, kept up to date by your counsellor as each step completes — and where to go for your appointment."
        aside={visible.length === 0 ? undefined : visible.map((s) => (
          <Badge key={s.country.code} tone={s.decision === "approved" ? "success" : s.decision === "refused" ? "danger" : "warning"}>
            {s.country.name}: {s.decision === "approved" ? "approved" : s.decision === "refused" ? "not successful" : "in progress"}
          </Badge>
        ))}
      />

      {visible.length === 0 ? (
        <Card>
          <PortalEmpty icon={Stamp} title="Your visa process has not started yet">
            There is nothing to show here yet. Once your visa process begins, your appointments and progress will appear on
            this page.
          </PortalEmpty>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {visible.map((s) => {
            const message = visaMessage(s.decision, student.full_name, s.country.name, toMessageTemplates(s.messages));
            return (
              <Card key={s.country.code} className="relative overflow-hidden">
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1.5 ${s.decision === "approved" ? "bg-success" : s.decision === "refused" ? "bg-danger" : "bg-hero"}`}
                />
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="bg-hero flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wider text-white shadow-sm shadow-primary/25">
                      {s.country.code}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-ink">{s.country.name}</h3>
                      {s.country.universities.length > 0 && (
                        <p className="text-xs text-muted">{s.country.universities.join(" · ")}</p>
                      )}
                    </div>
                  </div>
                  <Badge tone={s.decision === "approved" ? "success" : s.decision === "refused" ? "danger" : "warning"}>
                    {s.decision === "approved" ? "Visa approved" : s.decision === "refused" ? "Not successful" : "In progress"}
                  </Badge>
                </div>

                {message && (
                  <div
                    className={`mb-4 rounded-xl p-4 ${
                      s.decision === "approved" ? "bg-success-bg" : "bg-warning-bg"
                    }`}
                  >
                    <h4 className={`mb-2 text-sm font-semibold ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                      {s.decision === "approved" && <PartyPopper aria-hidden className="mr-1.5 inline h-4 w-4 shrink-0 align-[-3px]" />}
                      {message.heading}
                    </h4>
                    {message.body.map((para) => (
                      <p key={para} className={`mb-2 text-sm last:mb-0 ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                        {para}
                      </p>
                    ))}
                    {/* Signed, because a message this personal reading as an
                        automated status line would undo it. */}
                    <p className={`mt-3 text-xs ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
                      — {message.signoff}
                    </p>
                    {s.decision === "refused" && s.reason && (
                      <p className="mt-2 text-xs text-warning">Reason given: {s.reason}</p>
                    )}
                  </div>
                )}

                {/* Progress and where to apply side by side on a wide screen. */}
                <div className={s.rows.length > 0 && s.offices.length > 0 ? "grid grid-cols-1 gap-x-10 lg:grid-cols-2" : ""}>
                {s.rows.length > 0 && (
                  <dl className="flex flex-col gap-0.5 rounded-xl bg-bg/60 px-4 py-2">
                    {s.rows.map((r) => (
                      <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-0">
                        <dt className="text-xs text-muted">{r.label}</dt>
                        <dd className="text-sm text-ink">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Where they actually go, and how to reach it. Not a
                    reference section: the first line answers which of the
                    offices below is theirs. */}
                {s.offices.length > 0 && (
                  <div className={s.rows.length > 0 ? "mt-4 border-t border-border pt-4 lg:mt-0 lg:border-t-0 lg:pt-0" : ""}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      <MapPin aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px] shrink-0" />
                      Where to apply
                    </h4>
                    <VisaOfficeList offices={s.offices} countryName={s.country.name} />
                  </div>
                )}
                </div>

                {/* Whatever the office added in the builder. Last, because it
                    is guidance around the process rather than the process. */}
                {s.extraSections.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <VisaPageSections sections={s.extraSections} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {appointmentLogin && (
        <Card>
          <h3 className="mb-2 flex items-center gap-2.5 text-base font-semibold text-ink">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-[18px] w-[18px]" />
            </span>
            Visa appointment portal
          </h3>
          <VisaCredentials
            studentId={student.id}
            credentialType={appointmentLogin}
            label={
              appointmentLogin === "visa_appointment_portal"
                ? "Your appointment portal login"
                : appointmentLogin.replace(/_/g, " ")
            }
          />
          {/* The one thing this page cannot do for them. A portal that locks
              an account after three wrong attempts is not the place to guess. */}
          <p className="mt-2 text-xs text-muted">
            If this login does not work, tell your counsellor rather than trying repeatedly — some appointment portals
            lock an account after a few failed attempts.
          </p>
        </Card>
      )}
    </div>
  );
}
