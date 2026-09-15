import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTrackerDefinitions, listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { formatDateOnly } from "@/lib/formatDate";
import { readVisaDecision, visaMessage } from "@/lib/visaOutcome";
import { VisaCredentials } from "./VisaCredentials";
import { VisaOfficeList } from "@/components/VisaOfficeList";
import { visaCountries } from "@/lib/visaCountries";
import { loadVisaOffices } from "@/lib/actions/visaOfficeQueries";

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
  const officesByDestination = await loadVisaOffices(
    countries.map((c) => c.destinationId).filter((d): d is string => Boolean(d))
  );

  const sections = await Promise.all(
    countries.map(async (c) => {
      const fields = (defsByCountry[c.code] ?? []).filter((f) => f.showOnStudentVisa);
      if (fields.length === 0) return null;

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
      if (!anythingRecorded && offices.length === 0) return null;

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

  // Edited in Setup › Visa messages. Null only on a database where the row was
  // deleted, and visaMessage falls back to its built-in copy then rather than
  // leaving a badge with nothing under it.
  const { data: templates } = await supabase
    .from("visa_messages")
    .select("approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff")
    .eq("id", true)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Visa</h2>
      <p className="mb-4 text-sm text-muted">
        Your visa progress, kept up to date by your counsellor as each step completes.
      </p>

      {visible.length === 0 ? (
        <EmptyState>
          There is nothing to show here yet. Once your visa process begins, your appointments and progress will appear on
          this page.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {visible.map((s) => {
            const message = visaMessage(s.decision, student.full_name, s.country.name, templates ?? null);
            return (
              <Card key={s.country.code}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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

                {message && (
                  <div
                    className={`mb-4 rounded-md p-4 ${
                      s.decision === "approved" ? "bg-success-bg" : "bg-warning-bg"
                    }`}
                  >
                    <h4 className={`mb-2 text-sm font-semibold ${s.decision === "approved" ? "text-success" : "text-warning"}`}>
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

                {s.rows.length > 0 && (
                  <dl className="flex flex-col gap-0.5">
                    {s.rows.map((r) => (
                      <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-0">
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
                  <div className={s.rows.length > 0 ? "mt-4 border-t border-border pt-4" : ""}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Where to apply
                    </h4>
                    <VisaOfficeList offices={s.offices} countryName={s.country.name} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {appointmentLogin && (
        <Card className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Visa appointment portal</h3>
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
