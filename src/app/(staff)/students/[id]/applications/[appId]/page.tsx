import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CredentialField } from "@/components/CredentialField";
import { StageForm } from "./StageForm";
import { TaskList } from "./TaskList";
import { ApplicationDetailsForm } from "./ApplicationDetailsForm";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { InterviewSection } from "@/components/InterviewSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ApplicationDetailPage(props: PageProps<"/students/[id]/applications/[appId]">) {
  const { id, appId } = await props.params;
  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("applications")
    .select(
      `id, current_stage, intake, deadline, application_fee, special_requirements,
       university:universities(id, name, city, contact_email, destination:destinations(pipeline_stages, country_code)),
       program:programs(name, page_link, requirements_link, application_portal_link)`
    )
    .eq("id", appId)
    .eq("student_id", id)
    .maybeSingle();

  if (error || !app) notFound();

  const university = one(app.university);
  const destination = university ? one(university.destination) : null;
  const pipelineStages: string[] = (destination?.pipeline_stages as string[]) ?? [];
  const countryCode = (destination as { country_code?: string } | null)?.country_code;
  const trackerDefs = countryCode ? (await listTrackerDefinitions([countryCode]))[countryCode] : undefined;
  const hasTracker = Boolean(trackerDefs?.length);
  const program = one(app.program);

  const revalidateTo = `/students/${id}/applications/${appId}`;

  await ensureStudentDocumentRequirements(id);

  const [{ data: tasks }, { data: rawDocs }, { data: interview }] = await Promise.all([
    supabase
      .from("application_tasks")
      .select("id, description, due_date, status, priority")
      .eq("application_id", appId)
      .order("due_date", { ascending: true }),
    supabase
      .from("student_documents")
      .select("id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, template:document_templates(name)")
      .eq("student_id", id)
      .or(`application_id.eq.${appId},application_id.is.null`)
      .returns<(DocRow & { custom_name: string | null; application_id: string | null; template: { name: string } | { name: string }[] | null })[]>(),
    supabase
      .from("application_interviews")
      .select("university_name, program_name, interview_details, interview_link, available_slots, confirmed_datetime")
      .eq("application_id", appId)
      .maybeSingle(),
  ]);

  function one2<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const templateName = one2(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Student-level documents (application_id null) are shared across every
      // application — uploading/verifying one here satisfies it everywhere,
      // not just this university, so it's labeled to make that clear.
      const name = d.application_id === null ? `${baseName} (shared — all applications)` : baseName;
      if (!d.file_path) return { ...d, name };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name, fileUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="w-full">
      <Link href={`/students/${id}/applications`} className="text-sm text-muted hover:text-ink">
        &larr; Back to applications
      </Link>

      <div className="mt-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{university?.name ?? "University"}</h2>
          <p className="text-sm text-muted">
            {program?.name ?? "No program selected"} {university?.city && `· ${university.city}`}
          </p>
        </div>
        <Badge tone="info">{app.current_stage.replace(/_/g, " ")}</Badge>
      </div>

      {hasTracker && (
        <div className="mb-6">
          <Link href={`/students/${id}/applications/${appId}/tracker`} className="text-sm font-medium text-primary hover:underline">
            Open country documentation tracker →
          </Link>
        </div>
      )}

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Application status</h3>
        <StageForm applicationId={appId} studentId={id} currentStage={app.current_stage} pipelineStages={pipelineStages} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Details</h3>
        <ApplicationDetailsForm
          applicationId={appId}
          studentId={id}
          deadline={app.deadline}
          application_fee={app.application_fee}
          special_requirements={app.special_requirements}
        />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        <DocumentChecklist
          docs={docsWithUrls}
          studentId={id}
          applicationId={appId}
          revalidateTo={revalidateTo}
          interviewSection={
            <InterviewSection
              applicationId={appId}
              revalidateTo={revalidateTo}
              data={
                interview
                  ? interview
                  : { university_name: university?.name ?? null, program_name: program?.name ?? null, interview_details: null, interview_link: null, available_slots: [], confirmed_datetime: null }
              }
            />
          }
        />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Links & contact</h3>
        <div className="flex flex-col gap-3 text-sm text-ink">
          <div className="flex items-center gap-2">
            <span>Course page:</span>
            {program?.page_link ? (
              <a
                href={program.page_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                👁️ View course page
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Requirements:</span>
            {program?.requirements_link ? (
              <a
                href={program.requirements_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                👁️ View requirements
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Application portal:</span>
            {program?.application_portal_link ? (
              <a
                href={program.application_portal_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                👁️ View application portal
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <p>University email: {university?.contact_email ?? <span className="text-muted">—</span>}</p>
        </div>
        <div className="mt-3">
          <CredentialField label="University portal" ownerType="application" ownerId={appId} credentialType="university_portal" revalidateTo={revalidateTo} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Tasks</h3>
        <TaskList tasks={tasks ?? []} applicationId={appId} revalidateTo={revalidateTo} />
      </Card>
    </div>
  );
}
