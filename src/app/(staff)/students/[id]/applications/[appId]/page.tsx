import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { StageForm } from "./StageForm";
import { TaskList } from "./TaskList";
import { VisaForm } from "./VisaForm";
import { COUNTRY_TRACKER_FIELDS } from "@/lib/countryTrackers";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ApplicationDetailPage(props: PageProps<"/students/[id]/applications/[appId]">) {
  const { id, appId } = await props.params;
  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("applications")
    .select(
      "id, current_stage, intake, university:universities(id, name, destination:destinations(pipeline_stages, country_code)), program:programs(name)"
    )
    .eq("id", appId)
    .eq("student_id", id)
    .maybeSingle();

  if (error || !app) notFound();

  const university = one(app.university);
  const destination = university ? one(university.destination) : null;
  const pipelineStages: string[] = (destination?.pipeline_stages as string[]) ?? [];
  const countryCode = (destination as { country_code?: string } | null)?.country_code;
  const hasTracker = countryCode ? Boolean(COUNTRY_TRACKER_FIELDS[countryCode]) : false;

  const { data: documents } = await supabase
    .from("student_documents")
    .select("id, category, status, file_path, deadline, rejected_reason")
    .eq("application_id", appId)
    .returns<DocRow[]>();

  const docsWithUrls = await Promise.all(
    (documents ?? []).map(async (d) => {
      if (!d.file_path) return { ...d, name: d.category };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name: d.category, fileUrl: data?.signedUrl ?? null };
    })
  );

  const { data: tasks } = await supabase
    .from("application_tasks")
    .select("id, description, due_date, status")
    .eq("application_id", appId)
    .order("due_date", { ascending: true });

  const { data: visa } = await supabase.from("visa_records").select("*").eq("application_id", appId).maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/students/${id}`} className="text-sm text-muted hover:text-ink">
        &larr; Back to student
      </Link>

      <div className="mt-4 mb-6">
        <BoardingPassTracker
          universityName={university?.name ?? "University"}
          programName={one(app.program)?.name}
          intake={app.intake}
          currentStage={app.current_stage}
          pipelineStages={pipelineStages}
        />
      </div>

      {hasTracker && (
        <div className="mb-6">
          <Link
            href={`/students/${id}/applications/${appId}/tracker`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Open country documentation tracker →
          </Link>
        </div>
      )}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Stage</h3>
        <StageForm applicationId={appId} studentId={id} currentStage={app.current_stage} pipelineStages={pipelineStages} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Tasks</h3>
        <TaskList tasks={tasks ?? []} applicationId={appId} studentId={id} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        <DocumentChecklist docs={docsWithUrls} studentId={id} applicationId={appId} revalidateTo={`/students/${id}/applications/${appId}`} />
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Visa</h3>
        <VisaForm applicationId={appId} studentId={id} visa={visa ?? null} />
      </Card>
    </div>
  );
}
