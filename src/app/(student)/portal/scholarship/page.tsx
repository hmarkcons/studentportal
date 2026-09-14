import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
import { scholarshipPortals } from "@/lib/scholarshipPortal";
import { callLink, callAbsenceNote } from "@/lib/scholarshipCallLink";
import { listCredentialTypesAction } from "@/lib/actions/countryTracker";
import { VisaCredentials } from "../visa/VisaCredentials";
import {
  SCHOLARSHIP_CURRENCY_SYMBOL,
  SCHOLARSHIP_STATUS_TONE,
  scholarshipStatusLabel,
  type ScholarshipStatus,
} from "@/lib/scholarships";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type Body = {
  name: string;
  region: string | null;
  academic_year: string | null;
  application_deadline: string | null;
  document_upload_deadline: string | null;
  courier_deadline: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  stipend_amount: string | null;
  benefits: string | null;
  source_url: string | null;
  call_status: string | null;
  call_expected_on: string | null;
  call_pdf_path: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_pdf_language: string | null;
};

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-xs text-muted sm:w-44">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

/**
 * The region's call for applications, as the student sees it.
 *
 * Given its own block rather than a link in the row of links, because it is
 * not one more reference: it is the rule the whole card summarises, and the
 * one document a student is expected to have read before they ring the office
 * about a threshold.
 *
 * The language is said out loud. Most regions publish the bando in Italian
 * only, and a student who opens forty pages of Italian expecting English
 * assumes the portal sent them to the wrong place.
 */
function CallForApplications({ body, signed }: { body: Body; signed: Map<string, string> }) {
  const call = callLink({
    ...body,
    call_pdf_signed_url: body.call_pdf_path ? signed.get(body.call_pdf_path) ?? null : null,
  });

  if (!call) {
    return (
      <p className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
        {callAbsenceNote(body)}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-primary bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3 py-2">
      <a
        href={call.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {call.kind === "page" ? "🔗" : "📄"} {call.label}
        {call.kind === "stored" ? "" : " →"}
      </a>
      <p className="mt-1 text-xs text-muted">
        {call.kind === "page"
          ? `The call, its annexes and the forms are published on ${body.name}'s own site. Everything on this card is a summary of it.`
          : `Published by ${body.name}. Everything on this card is a summary of it — the call is what decides.`}
        {call.language === "it" && " It is in Italian; ask your counsellor if anything in it is unclear."}
      </p>
    </div>
  );
}

// The student's own view of their DSU scholarship.
//
// student_scholarships_select has always granted a student their own rows once
// the application's pre-enrolment on Universitaly is finalised — the policy was
// written for this page, which did not exist, so the tick on the staff side
// gated a view nobody could reach. Row-level security is what decides here:
// this page queries the student's scholarships and gets back only what that
// policy allows, so an application still awaiting pre-enrolment simply returns
// nothing rather than needing a second check in the app.
export default async function PortalScholarshipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase.from("leads").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();

  // Their own logins for the agency portals. Listed here and decrypted only
  // when they press Show — read_credential has always allowed a student to
  // read their own, the same as the visa appointment login.
  const portals = student ? scholarshipPortals(await listCredentialTypesAction("student", student.id)) : [];
  if (!student) return null;

  const { data: scholarships } = await supabase
    .from("student_scholarships")
    .select(
      "id, name, status, award_amount, application_deadline, body:scholarship_bodies(name, region, academic_year, application_deadline, document_upload_deadline, courier_deadline, isee_threshold, ispe_threshold, stipend_amount, benefits, source_url, call_status, call_expected_on, call_pdf_path, call_pdf_url, call_page_url, call_pdf_language)"
    )
    .eq("student_id", student.id);

  // The copy HMARK holds of each call, signed for this student. Any signed-in
  // user may read scholarship-calls (0175), so this is the student's own link
  // to the same paper their counsellor is reading — and it keeps answering
  // after the region takes the original down, which they do every year.
  //
  // Signed once per path: two scholarships in the same region share a body.
  const callPaths = [
    ...new Set(
      (scholarships ?? [])
        .map((s) => (one(s.body as never) as Body | null)?.call_pdf_path)
        .filter((p): p is string => Boolean(p))
    ),
  ];
  const signedCalls = new Map<string, string>();
  await Promise.all(
    callPaths.map(async (path) => {
      const { data } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (data?.signedUrl) signedCalls.set(path, data.signedUrl);
    })
  );

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Scholarship</h2>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Italy&rsquo;s regional scholarships (DSU) are awarded by the region your university sits in, on the basis of
        your family&rsquo;s ISEE and ISPE assessment.
      </p>

      {(scholarships ?? []).length === 0 ? (
        <Card>
          <EmptyState>
            Nothing to show yet. Your scholarship appears here once your pre-enrollment on Universitaly.it has been
            finalized and we have recorded your application with the regional body. Your counsellor can tell you where
            it has got to in the meantime.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {(scholarships ?? []).map((s) => {
            const body = one(s.body as never) as Body | null;
            return (
              <Card key={s.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-ink">{s.name ?? body?.name ?? "Scholarship"}</h3>
                    <p className="text-xs text-muted">
                      {[s.name && body ? body.name : null, body?.region, body?.academic_year]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge tone={SCHOLARSHIP_STATUS_TONE[s.status as ScholarshipStatus] ?? "neutral"}>
                    {scholarshipStatusLabel(s.status)}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <Detail
                    label="Award"
                    value={
                      s.award_amount != null
                        ? `${SCHOLARSHIP_CURRENCY_SYMBOL}${Number(s.award_amount).toLocaleString("en-US")}`
                        : null
                    }
                  />
                  <Detail
                    label="Your deadline"
                    value={s.application_deadline ? formatDateOnly(s.application_deadline, { day: "numeric", month: "short", year: "numeric" }) : null}
                  />
                  <Detail label="Application window" value={body?.application_deadline ?? null} />
                  <Detail label="Document upload by" value={body?.document_upload_deadline ?? null} />
                  <Detail label="Courier by" value={body?.courier_deadline ?? null} />
                  <Detail label="ISEE threshold" value={body?.isee_threshold ?? null} />
                  <Detail label="ISPE threshold" value={body?.ispe_threshold ?? null} />
                  <Detail label="Stipend" value={body?.stipend_amount ?? null} />
                  <Detail label="Also covers" value={body?.benefits ?? null} />
                </div>

                {/* The call is the document that actually governs: every
                    deadline, threshold and required paper on this card is a
                    summary of it. A student who is asked for an ISEE nobody
                    explained needs to be able to read the rule themselves. */}
                {body && <CallForApplications body={body} signed={signedCalls} />}

                {body?.source_url && (
                  <a
                    href={body.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {body.name} &mdash; official site &rarr;
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* So a student never has to ring the office for their own password. */}
      {student && portals.length > 0 && (
        <Card className="mt-6">
          <h3 className="mb-1 text-sm font-medium text-ink">Your scholarship portal logins</h3>
          <p className="mb-3 text-xs text-muted">
            Your own accounts on the scholarship portals. Nothing is shown until you ask for it.
          </p>
          <div className="flex flex-col gap-3">
            {portals.map((portal) => (
              <VisaCredentials
                key={portal.credentialType}
                studentId={student.id}
                credentialType={portal.credentialType}
                label={portal.label}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
