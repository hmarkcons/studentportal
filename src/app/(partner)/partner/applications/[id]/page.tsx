import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PartnerStageForm } from "./PartnerStageForm";
import { LetterUploadForm } from "./LetterUploadForm";

type Row = {
  application_id: string;
  student_name: string;
  program_name: string | null;
  intake: string | null;
  current_stage: string;
  pipeline_stages: string[];
  student_email: string | null;
  student_phone: string | null;
  documents_summary: Record<string, string> | null;
};

export default async function PartnerApplicationDetailPage(props: PageProps<"/partner/applications/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_partner_applications");
  const rows = (data ?? []) as Row[];
  const app = rows.find((r) => r.application_id === id);
  if (!app) notFound();

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
        {app.documents_summary && Object.keys(app.documents_summary).length > 0 ? (
          <div className="flex flex-col gap-1">
            {Object.entries(app.documents_summary).map(([cat, status]: [string, string]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-ink">{cat.replace(/_/g, " ")}</span>
                <Badge tone={status === "verified" ? "success" : "warning"}>{status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No documents yet.</p>
        )}
      </Card>

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
