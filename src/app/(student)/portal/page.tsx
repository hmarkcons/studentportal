import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { EmptyState } from "@/components/ui/EmptyState";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { loadPortalSummary } from "@/lib/portalSummary";
import { PortalAttention } from "@/components/PortalAttention";
import { WHATSAPP_LINK } from "@/lib/constants";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PortalDashboardPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, assigned_counselor:staff!assigned_counselor_id(full_name, designation, phone, whatsapp_number)")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [{ data: applications }, summary, { data: leadDestinations }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, current_stage, intake, university:universities(name, destination:destinations(id, display_name, pipeline_stages, dashboard_pipeline_stages)), program:programs(name)"
      )
      .eq("student_id", student.id),
    loadPortalSummary(supabase, student.id),
    supabase
      .from("lead_destinations")
      .select("destination_id, dashboard_stage_values, destination:destinations(display_name, dashboard_pipeline_stages)")
      .eq("lead_id", student.id),
  ]);

  const counselor = one(student.assigned_counselor);

  // Same destination-level grouping as the staff Dashboard (see
  // students/[id]/page.tsx) — one card per destination the student has a
  // real application to, OR selected as a country of interest at
  // registration with no application yet, read-only here.
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
  for (const sd of leadDestinations ?? []) {
    if (destinationGroups.has(sd.destination_id)) continue;
    const dest = one(sd.destination as never) as { display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
    if (!dest) continue;
    destinationGroups.set(sd.destination_id, {
      destinationName: dest.display_name ?? "Destination",
      stages: dest.dashboard_pipeline_stages ?? [],
      universityNames: [],
    });
  }
  const destinationPipelineRows = Array.from(destinationGroups.entries())
    .filter(([, group]) => group.stages.length > 0)
    .map(([destinationId, group]) => ({
      destinationId,
      destinationName: group.destinationName,
      applicationSummary: group.universityNames.length === 0
        ? "No application yet"
        : group.universityNames.length === 1
          ? group.universityNames[0]
          : `${group.universityNames.length} applications`,
      stages: group.stages,
      values: savedValuesByDestinationId.get(destinationId) ?? {},
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Welcome back, {student.full_name}</h2>

      {/* Everything outstanding, in one place — documents, money,
          appointments and replies. Each row is computed by the same helper the
          section it links to uses, so the two cannot disagree. */}
      <PortalAttention summary={summary} />

      {counselor && (
        <Card className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-ink">Your counsellor</h3>
          <p className="text-sm text-ink">{counselor.full_name}</p>
          <p className="text-xs text-muted">{counselor.designation ?? "Counsellor"}</p>
          {/* Tappable rather than plain text: a student reading this on a
              phone should not have to copy a number out by hand. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {counselor.phone && (
              <a
                href={`tel:${counselor.phone.replace(/[^+\d]/g, "")}`}
                className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg"
              >
                📞 {counselor.phone}
              </a>
            )}
            <a
              href={WHATSAPP_LINK}
              className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              💬 WhatsApp HMARK
            </a>
          </div>
        </Card>
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
