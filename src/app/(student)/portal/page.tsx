import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { EmptyState } from "@/components/ui/EmptyState";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDashboardPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, assigned_counselor:staff(full_name, designation, phone, whatsapp_number)")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [{ data: applications }, { count: pendingDocs }, { count: unassignedDocs }, { data: leadDestinations }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, current_stage, intake, university:universities(name, destination:destinations(id, display_name, pipeline_stages, dashboard_pipeline_stages)), program:programs(name)"
      )
      .eq("student_id", student.id),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .in("status", ["missing", "rejected"]),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .is("application_id", null)
      .in("status", ["missing", "rejected"]),
    supabase.from("lead_destinations").select("destination_id, dashboard_stage_values").eq("lead_id", student.id),
  ]);

  const counselor = one(student.assigned_counselor);

  // Same destination-level grouping as the staff Dashboard (see
  // students/[id]/page.tsx) — one card per destination the student has a
  // real application to, read-only here.
  const savedValuesByDestinationId = new Map<string, Record<string, string>>(
    (leadDestinations ?? []).map((sd) => [sd.destination_id, (sd.dashboard_stage_values as Record<string, string> | null) ?? {}])
  );
  const destinationGroups = new Map<string, { destinationName: string; stages: DashboardStageDef[]; universityNames: string[] }>();
  for (const app of applications ?? []) {
    const uni = one(app.university as never) as {
      name?: string;
      destination?:
        | { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] }
        | { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] }[];
    } | null;
    const dest = uni?.destination
      ? (one(uni.destination as never) as { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null)
      : null;
    if (!dest?.id) continue;
    if (!destinationGroups.has(dest.id)) {
      destinationGroups.set(dest.id, {
        destinationName: dest.display_name ?? "Destination",
        stages: dest.dashboard_pipeline_stages ?? [],
        universityNames: [],
      });
    }
    destinationGroups.get(dest.id)!.universityNames.push(uni?.name ?? "University");
  }
  const destinationPipelineRows = Array.from(destinationGroups.entries())
    .filter(([, group]) => group.stages.length > 0)
    .map(([destinationId, group]) => ({
      destinationId,
      destinationName: group.destinationName,
      applicationSummary: group.universityNames.length === 1 ? group.universityNames[0] : `${group.universityNames.length} applications`,
      stages: group.stages,
      values: savedValuesByDestinationId.get(destinationId) ?? {},
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Welcome back, {student.full_name}</h2>

      {counselor && (
        <Card className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Your counselor</h3>
          <p className="text-sm text-ink">{counselor.full_name}</p>
          <p className="text-xs text-muted">
            {counselor.designation ?? "Counselor"} · {counselor.phone ?? counselor.whatsapp_number ?? "—"}
          </p>
        </Card>
      )}

      {(pendingDocs ?? 0) > 0 && (
        <Link href="/portal/documents">
          <Card className="mb-6 bg-warning-bg">
            <p className="text-sm text-warning">
              {pendingDocs} document(s) need your attention{(unassignedDocs ?? 0) > 0 ? ` — including ${unassignedDocs} general document(s)` : ""}. Tap
              to upload.
            </p>
          </Card>
        </Link>
      )}

      {destinationPipelineRows.length > 0 && (
        <div className="mb-6 flex flex-col gap-4">
          {destinationPipelineRows.map((row) => (
            <DestinationPipelineCard
              key={row.destinationId}
              leadId={student.id}
              destinationId={row.destinationId}
              destinationName={row.destinationName}
              subtitle={row.applicationSummary}
              stages={row.stages}
              values={row.values}
              editable={false}
              revalidateTo="/portal"
            />
          ))}
        </div>
      )}

      <h3 className="mb-3 text-sm font-medium text-ink">Your applications</h3>
      <div className="flex flex-col gap-4">
        {(applications ?? []).map((app) => {
          const uni = one(app.university);
          const dest = uni ? one(uni.destination as never) : null;
          return (
            <Link key={app.id} href={`/portal/applications/${app.id}`}>
              <BoardingPassTracker
                universityName={uni?.name ?? "University"}
                programName={one(app.program)?.name}
                intake={app.intake}
                currentStage={app.current_stage}
                pipelineStages={(dest as { pipeline_stages?: string[] } | null)?.pipeline_stages ?? []}
              />
            </Link>
          );
        })}
        {(!applications || applications.length === 0) && <EmptyState>No applications yet.</EmptyState>}
      </div>
    </div>
  );
}
