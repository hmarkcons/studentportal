import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { formatDateOnly } from "@/lib/formatDate";
import { readVisaDecision, visaMessage } from "@/lib/visaOutcome";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** Date-only tracker values render as dates; everything else as written. */
function display(value: string, type: string | undefined) {
  if (!value) return "—";
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value);
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
    .select("id, university:universities(name, destination:destinations(country_code, display_name))")
    .eq("student_id", student.id);

  const byCountry = new Map<string, { code: string; name: string; appId: string; universities: string[] }>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { country_code?: string; display_name?: string } | null) : null;
    if (!dest?.country_code) continue;
    const existing = byCountry.get(dest.country_code);
    if (existing) {
      if (uni?.name && !existing.universities.includes(uni.name)) existing.universities.push(uni.name);
    } else {
      byCountry.set(dest.country_code, {
        code: dest.country_code,
        name: dest.display_name ?? dest.country_code,
        appId: a.id,
        universities: uni?.name ? [uni.name] : [],
      });
    }
  }

  const codes = Array.from(byCountry.keys());
  const defsByCountry = codes.length ? await listTrackerDefinitions(codes) : {};

  const sections = await Promise.all(
    Array.from(byCountry.values()).map(async (c) => {
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

      return {
        country: c,
        // The decision and its reason are shown in the message, not repeated
        // as ordinary rows.
        rows: fields.filter((f) => !f.visaRole).map((f) => ({ label: f.label, value: display(values[f.key] ?? "", f.type) })),
        decision,
        reason: reasonField ? values[reasonField.key] ?? "" : "",
      };
    })
  );

  const visible = sections.filter((s): s is NonNullable<typeof s> => s !== null);

  // Credentials are encrypted at rest behind a vault key and decrypting them
  // into the student portal would be a real change in who can read secrets —
  // so this only reports that the login exists, and points at the counsellor.
  const { data: credentials } = await supabase
    .from("encrypted_credentials")
    .select("credential_type")
    .eq("owner_type", "student")
    .eq("owner_id", student.id);
  const appointmentLogin = (credentials ?? []).find((c) => /vfs|appointment|visa/i.test(c.credential_type));

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
            const message = visaMessage(s.decision, student.full_name);
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
              </Card>
            );
          })}
        </div>
      )}

      {appointmentLogin && (
        <Card className="mt-6">
          <h3 className="mb-1 text-sm font-medium text-ink">Visa appointment portal</h3>
          <p className="text-sm text-ink">
            Your visa appointment portal login has been set up by your counsellor.
          </p>
          <p className="mt-1 text-xs text-muted">
            Ask them for the details — we never show portal passwords in the portal or send them by email.
          </p>
        </Card>
      )}
    </div>
  );
}
