import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CredentialField } from "@/components/CredentialField";
import { StageForm } from "./StageForm";
import { TaskList } from "./TaskList";
import { ApplicationDetailsForm } from "./ApplicationDetailsForm";
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
  const hasTracker = countryCode ? Boolean(COUNTRY_TRACKER_FIELDS[countryCode]) : false;
  const program = one(app.program);

  const { data: tasks } = await supabase
    .from("application_tasks")
    .select("id, description, due_date, status, priority")
    .eq("application_id", appId)
    .order("due_date", { ascending: true });

  const revalidateTo = `/students/${id}/applications/${appId}`;

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
        <h3 className="mb-3 text-sm font-medium text-ink">Links & contact</h3>
        <div className="flex flex-col gap-1 text-sm text-ink">
          <p>
            Course page:{" "}
            {program?.page_link ? (
              <a href={program.page_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {program.page_link}
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </p>
          <p>
            Requirements:{" "}
            {program?.requirements_link ? (
              <a href={program.requirements_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {program.requirements_link}
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </p>
          <p>
            Application portal:{" "}
            {program?.application_portal_link ? (
              <a href={program.application_portal_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {program.application_portal_link}
              </a>
            ) : (
              <span className="text-muted">—</span>
            )}
          </p>
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
