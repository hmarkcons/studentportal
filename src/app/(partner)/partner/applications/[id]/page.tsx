import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE } from "@/lib/constants";
import { addedLine, changedLine, reviewedLine, uploadedLine, type UploaderRole } from "@/lib/activityStamp";
import { interviewTimes, interviewStatusLabel, INTERVIEW_STATUS_TONE, platformLabel, type InterviewStatus } from "@/lib/interviews";
import { PartnerStageForm } from "./PartnerStageForm";
import { LetterUploadForm } from "./LetterUploadForm";

// One entry per document rather than a category→status map. The map collapsed
// every document sharing a category into whichever row aggregated last, so a
// university reading "other: pending" was in fact looking at three files
// (fixed in the RPC, migration 0154).
type DocumentEntry = {
  name: string;
  status: string;
  uploaded_at: string | null;
  uploaded_by_role: UploaderRole | null;
  verified_at: string | null;
};

type Row = {
  application_id: string;
  student_name: string;
  program_name: string | null;
  intake: string | null;
  current_stage: string;
  pipeline_stages: string[];
  student_email: string | null;
  student_phone: string | null;
  documents_summary: DocumentEntry[] | null;
};

type InterviewRow = {
  id: string;
  round_label: string;
  confirmed_datetime: string | null;
  timezone: string | null;
  platform: string | null;
  platform_other: string | null;
  status: string;
  interview_details: string | null;
  interview_link: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function PartnerApplicationDetailPage(props: PageProps<"/partner/applications/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_partner_applications");
  const rows = (data ?? []) as Row[];
  const app = rows.find((r) => r.application_id === id);
  if (!app) notFound();

  // The university runs the interview, so it can now see the schedule — its own
  // applications only, and without the login credentials, which stay in the
  // table they were given precisely so they could be withheld (0151, 0154).
  const { data: interviewData } = await supabase
    .from("application_interviews")
    .select(
      "id, round_label, confirmed_datetime, timezone, platform, platform_other, status, interview_details, interview_link, created_at, updated_at"
    )
    .eq("application_id", id)
    .order("confirmed_datetime", { ascending: true, nullsFirst: false });
  const interviews = (interviewData ?? []) as InterviewRow[];

  const documents = Array.isArray(app.documents_summary) ? app.documents_summary : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/partner" className="text-sm text-muted hover:text-ink">
        &larr; Back to dashboard
      </Link>

      <div className="mt-2 mb-6">
        <h2 className="text-xl font-semibold text-ink">{app.student_name}</h2>
        <p className="text-sm text-muted">
          {app.program_name ?? "—"} {app.intake && `· ${app.intake}`}
        </p>
        {app.student_email && <p className="text-sm text-muted">{app.student_email} · {app.student_phone}</p>}
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Status</h3>
        <PartnerStageForm applicationId={id} currentStage={app.current_stage} pipelineStages={app.pipeline_stages ?? []} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        {documents.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {documents.map((doc, index) => (
              <div key={`${doc.name}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block capitalize text-ink">{doc.name}</span>
                  {/* When it arrived and when it was reviewed. Without these a
                      university could not tell whether a document had been
                      waiting a day or a month. */}
                  <span className="flex flex-col gap-0.5 text-xs text-muted">
                    {uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "partner" }) && (
                      <span>{uploadedLine({ at: doc.uploaded_at, byRole: doc.uploaded_by_role, audience: "partner" })}</span>
                    )}
                    {reviewedLine(doc.verified_at, doc.status, "partner") && (
                      <span>{reviewedLine(doc.verified_at, doc.status, "partner")}</span>
                    )}
                    {!doc.uploaded_at && <span>Not uploaded yet</span>}
                  </span>
                </span>
                <Badge tone={DOCUMENT_STATUS_TONE[doc.status] ?? "neutral"}>
                  {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No documents yet.</EmptyState>
        )}
      </Card>

      {interviews.length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Interviews</h3>
          <div className="flex flex-col gap-3">
            {interviews.map((i) => {
              const times = interviewTimes(i.confirmed_datetime, i.timezone);
              const changed = changedLine(i.created_at, i.updated_at, "Last updated");
              return (
                <div key={i.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {i.round_label}
                      <span className="ml-2 font-normal text-muted">{platformLabel(i.platform, i.platform_other)}</span>
                    </p>
                    <Badge tone={INTERVIEW_STATUS_TONE[i.status as InterviewStatus] ?? "neutral"}>
                      {interviewStatusLabel(i.status)}
                    </Badge>
                  </div>
                  {times && (
                    <p className="mt-1 text-xs text-muted">
                      {/* Your own time first — this is your portal — with the
                          student's Karachi reading alongside it, since that is
                          the clock they will turn up by. */}
                      {times.sameZone ? (
                        <>{times.studentTime} (Pakistan)</>
                      ) : (
                        <>
                          {times.universityTime} {times.universityZoneLabel} · {times.studentTime} for the student
                        </>
                      )}
                    </p>
                  )}
                  {i.interview_link && (
                    <a
                      href={i.interview_link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-xs font-medium text-primary hover:underline"
                    >
                      Joining link / details &rarr;
                    </a>
                  )}
                  {i.interview_details && <p className="mt-1 text-xs text-muted">{i.interview_details}</p>}
                  <p className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                    {addedLine(i.created_at, "Added by HMARK") && <span>{addedLine(i.created_at, "Added by HMARK")}</span>}
                    {changed && <span>{changed}</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Upload official document</h3>
        <div className="flex flex-col gap-2">
          <LetterUploadForm applicationId={id} category="offer_letter" label="offer letter" />
          <LetterUploadForm applicationId={id} category="rejection_letter" label="rejection letter" />
        </div>
      </Card>
    </div>
  );
}
