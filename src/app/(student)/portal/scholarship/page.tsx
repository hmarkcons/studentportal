import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateOnly } from "@/lib/formatDate";
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
  if (!student) return null;

  const { data: scholarships } = await supabase
    .from("student_scholarships")
    .select(
      "id, name, status, award_amount, application_deadline, body:scholarship_bodies(name, region, academic_year, application_deadline, document_upload_deadline, courier_deadline, isee_threshold, ispe_threshold, stipend_amount, benefits, source_url)"
    )
    .eq("student_id", student.id);

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
    </div>
  );
}
