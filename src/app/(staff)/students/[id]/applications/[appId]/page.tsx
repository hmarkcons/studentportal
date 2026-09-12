import { loadDocumentHistory } from "@/lib/documentHistory";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CredentialField } from "@/components/CredentialField";
import { StageForm } from "./StageForm";
import { TaskList } from "./TaskList";
import { ApplicationDetailsForm } from "./ApplicationDetailsForm";
import { AddBackupPrograms } from "./AddBackupPrograms";
import { LinksContactForm } from "./LinksContactForm";
import { listTrackerDefinitions } from "@/lib/actions/countryTracker";
import { DocumentChecklist, type DocRow } from "@/components/DocumentChecklist";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { hasPermission } from "@/lib/auth/permissions";
import { InterviewSection, type InterviewRow } from "@/components/InterviewSection";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function ApplicationDetailPage(props: PageProps<"/students/[id]/applications/[appId]">) {
  const { id, appId } = await props.params;
  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("applications")
    .select(
      `id, current_stage, intake, deadline, application_fee, special_requirements, program_id, is_finalized,
       university:universities(id, name, city, contact_email, destination:destinations(pipeline_stages, country_code)),
       program:programs(id, name, page_link, requirements_link, application_portal_link)`
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

  // Every programme at this university, and which of them this student already
  // has an application for — the two things the Details form and the backup
  // picker each need.
  const [{ data: universityPrograms }, { data: siblingApps }] = await Promise.all([
    university?.id
      ? supabase.from("programs").select("id, name").eq("university_id", university.id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    university?.id
      ? supabase
          .from("applications")
          .select("id, program_id, program:programs(name)")
          .eq("student_id", id)
          .eq("university_id", university.id)
          .neq("id", appId)
      : Promise.resolve({ data: [] as { id: string; program_id: string | null; program: unknown }[] }),
  ]);

  const takenProgramIds = new Set(
    [app.program_id, ...(siblingApps ?? []).map((a) => a.program_id)].filter(Boolean) as string[]
  );
  const availablePrograms = (universityPrograms ?? []).filter((p) => !takenProgramIds.has(p.id));
  const siblings = (siblingApps ?? []).map((a) => ({
    id: a.id,
    name: (one(a.program as never) as { name?: string } | null)?.name ?? null,
  }));

  const revalidateTo = `/students/${id}/applications/${appId}`;

  await ensureStudentDocumentRequirements(id);

  const [sections, canManage, canManageInterviews] = await Promise.all([
    loadStudentChecklistSections(supabase, id),
    hasPermission("documents.manage_requirements"),
    hasPermission("interviews.manage"),
  ]);

  const [{ data: tasks }, { data: rawDocs }, { data: interviews }] = await Promise.all([
    supabase
      .from("application_tasks")
      .select("id, description, due_date, status, priority")
      .eq("application_id", appId)
      .order("due_date", { ascending: true }),
    supabase
      .from("student_documents")
      .select(
      "id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, uploaded_at, uploaded_by_role, verified_at, created_at, template_id, template:document_templates(name)"
    )
      .eq("student_id", id)
      // Only requirements added for THIS application. The standard checklist is
      // student-level and identical for every university, so pulling it in here
      // repeated the same documents on every university's application page.
      .eq("application_id", appId)
      .returns<(DocRow & { custom_name: string | null; application_id: string | null; template: { name: string } | { name: string }[] | null })[]>(),
    supabase
      .from("application_interviews")
      .select(
        "id, round_label, confirmed_datetime, timezone, platform, platform_other, status, interview_details, interview_link, preparation_notes, created_at, updated_at, credentials:application_interview_credentials(login_username, login_password, login_instructions, share_with_student)"
      )
      .eq("application_id", appId)
      .order("confirmed_datetime", { ascending: true, nullsFirst: false }),
  ]);

  // PostgREST returns an embedded one-to-one row as an object or a
  // single-element array depending on the relationship it infers, so both are
  // flattened before the component sees them.
  const interviewRows = (interviews ?? []).map((i) => {
    const embedded = i.credentials as unknown;
    const credentials = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
    return { ...i, credentials } as InterviewRow;
  });

  function one2<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  const docHistory = await loadDocumentHistory(supabase, (rawDocs ?? []).map((d) => d.id));

  const docsWithUrls = await Promise.all(
    (rawDocs ?? []).map(async (d) => {
      const templateName = one2(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      // Student-level documents (application_id null) are shared across every
      // application — uploading/verifying one here satisfies it everywhere,
      // not just this university, so it's labeled to make that clear.
      const name = d.application_id === null ? `${baseName} (shared — all applications)` : baseName;
      const past = docHistory.get(d.id) ?? [];
      if (!d.file_path) return { ...d, name, history: past };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, name, history: past, fileUrl: data?.signedUrl ?? null };
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

      {/* One tracker per country, on the student's dashboard — not one per
          application. This used to open a second tracker keyed to this
          application, whose answers the dashboard could not see. */}
      {hasTracker && (
        <div className="mb-6">
          <Link href={`/students/${id}`} className="text-sm font-medium text-primary hover:underline">
            Open the country documentation tracker on the dashboard →
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
          intake={app.intake}
          programId={app.program_id}
          programs={universityPrograms ?? []}
          isFinalized={app.is_finalized}
          universityName={university?.name ?? "this university"}
        />
        {/* The office applies to two or three programmes at one university.
            Creation handles that with its "+ Add another program" slots;
            afterwards there was no way to add one without going back to New
            application and re-picking the country and university. */}
        <div className="mt-4 border-t border-border pt-3">
          <AddBackupPrograms
            applicationId={appId}
            studentId={id}
            universityName={university?.name ?? "this university"}
            available={availablePrograms}
            siblings={siblings}
          />
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        <DocumentChecklist
          docs={docsWithUrls}
          studentId={id}
          applicationId={appId}
          revalidateTo={revalidateTo}
          sections={sections}
          canManage={canManage}
          // A university's own document ask belongs in Admission Documents,
          // which is where the brief puts it and where it then shows on the
          // student's Documents tab too. The other sections appear here only
          // once they actually hold one of this application's extras.
          emptySections={["admission"]}
        />
      </Card>

      {/* Its own card, not a section inside the documents checklist.
          It was nested in there as an "interview" pseudo-section, which meant
          it only rendered if somebody had added an Interview *document*
          section to that destination's checklist in Setup — so whether a
          university requires an interview depended on an unrelated setting,
          and for most destinations the whole feature was invisible. */}
      <Card className="mb-6">
        <h3 className="mb-1 text-sm font-medium text-ink">Interview</h3>
        <p className="mb-3 text-xs text-muted">
          Rounds this university requires for the application. The student sees each one on their Appointments page,
          in their own time.
        </p>
        <InterviewSection
          applicationId={appId}
          revalidateTo={revalidateTo}
          interviews={interviewRows}
          canManage={canManageInterviews}
        />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Links & contact</h3>
        <LinksContactForm
          applicationId={appId}
          studentId={id}
          programId={program?.id ?? null}
          universityId={university?.id ?? null}
          pageLink={program?.page_link ?? null}
          requirementsLink={program?.requirements_link ?? null}
          applicationPortalLink={program?.application_portal_link ?? null}
          contactEmail={university?.contact_email ?? null}
        />
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
