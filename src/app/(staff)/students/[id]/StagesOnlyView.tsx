import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import { buildStageRows, stageSnapshot, type StageApplication, type StageDestination } from "@/lib/stageProgress";
import type { DashboardStageDef, DashboardStageValues } from "@/lib/dashboardPipeline";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

type Dest = { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] | null };

/**
 * A registered student's record as their counsellor sees it: how far they
 * have got in each country, who they are and how to reach them, and who in
 * processing is handling them. Nothing here can be changed — the stages are
 * processing's to record (src/lib/auth/studentAccess.ts).
 *
 * Loads only what it shows. The full record builds the document checklist,
 * prices the invoice and reads the trackers on every open; none of that is
 * for this reader.
 */
export async function StagesOnlyView({ studentId, supabase }: { studentId: string; supabase: SupabaseClient }) {
  const [{ data: student }, { data: lead }, { data: destinations }, { data: applications }] = await Promise.all([
    supabase
      .from("students")
      .select("full_name, email, contact_number, student_code, intake, registration_status")
      .eq("id", studentId)
      .maybeSingle(),
    supabase.from("leads").select("assigned_counselor_id, processing_officer_id").eq("id", studentId).maybeSingle(),
    supabase
      .from("lead_destinations")
      .select("destination_id, is_backup, dashboard_stage_values, destination:destinations(id, display_name, dashboard_pipeline_stages)")
      .eq("lead_id", studentId)
      .order("is_backup"),
    supabase
      .from("applications")
      .select("id, university:universities(name, destination:destinations(id, display_name, dashboard_pipeline_stages))")
      .eq("student_id", studentId)
      .order("sort_order", { ascending: true, nullsFirst: false }),
  ]);

  const officerId = lead?.processing_officer_id ?? null;
  const [{ data: officer }, { data: counselor }] = await Promise.all([
    officerId
      ? supabase.from("staff").select("full_name, email_official, mobile_official").eq("id", officerId).maybeSingle()
      : Promise.resolve({ data: null }),
    lead?.assigned_counselor_id
      ? supabase.from("staff").select("full_name").eq("id", lead.assigned_counselor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stageApplications: StageApplication[] = (applications ?? []).flatMap((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = one(uni?.destination as never) as Dest | null;
    return dest?.id
      ? [{ destinationId: dest.id, destinationName: dest.display_name ?? "", stages: dest.dashboard_pipeline_stages ?? [], universityName: uni?.name ?? "" }]
      : [];
  });
  const registered: StageDestination[] = (destinations ?? []).map((d) => {
    const dest = one(d.destination as never) as Dest | null;
    return {
      destinationId: d.destination_id as string,
      destinationName: dest?.display_name ?? "",
      stages: dest?.dashboard_pipeline_stages ?? [],
      values: (d.dashboard_stage_values as DashboardStageValues | null) ?? {},
    };
  });
  const rows = buildStageRows(stageApplications, registered);

  return (
    <div className="flex flex-col gap-6" data-stages-only>
      <p className="rounded-md border border-info bg-info-bg px-3 py-2 text-sm text-info">
        You&apos;re following {student?.full_name ?? "this student"}&apos;s progress. The processing team handles their documents,
        applications, scholarship and visa{officer?.full_name ? ` — ${officer.full_name} is their processing officer` : ""}.
      </p>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No country stages to show yet — none of this student&apos;s countries has stages set up.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => {
            const snap = stageSnapshot(row.stages, row.values);
            return (
              <div key={row.destinationId} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted">
                  {snap.done} of {snap.total} stages done · {snap.complete ? "complete" : `now at ${snap.currentLabel}`}
                  {snap.blocked && snap.latest ? ` · ${snap.latest}` : ""}
                </p>
                <DestinationPipelineCard
                  leadId={studentId}
                  destinationId={row.destinationId}
                  destinationName={row.destinationName}
                  subtitle={row.applicationSummary}
                  stages={row.stages}
                  values={row.values}
                  editable={false}
                  revalidateTo={`/students/${studentId}`}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Student</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Student ID</dt>
            <dd className="text-ink">{student?.student_code ?? "—"}</dd>
            <dt className="text-muted">Intake</dt>
            <dd className="text-ink">{student?.intake ?? "—"}</dd>
            <dt className="text-muted">Status</dt>
            <dd>
              <Badge tone={student?.registration_status === "registered" ? "success" : "warning"}>
                {student?.registration_status === "registered" ? "Registered" : (student?.registration_status ?? "—")}
              </Badge>
            </dd>
            <dt className="text-muted">Phone</dt>
            <dd className="text-ink">{student?.contact_number ?? "—"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all text-ink">{student?.email ?? "—"}</dd>
          </dl>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-ink">Who is handling them</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Counsellor</dt>
            <dd className="text-ink">{counselor?.full_name ?? "—"}</dd>
            <dt className="text-muted">Processing officer</dt>
            <dd className="text-ink">
              {officer?.full_name ?? "The processing team"}
              {officer?.email_official && <span className="block text-xs text-muted">{officer.email_official}</span>}
              {officer?.mobile_official && <span className="block text-xs text-muted">{officer.mobile_official}</span>}
            </dd>
          </dl>
          <Link href={`/students/${studentId}/communication`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
            Messages with the student →
          </Link>
        </Card>
      </div>
    </div>
  );
}
