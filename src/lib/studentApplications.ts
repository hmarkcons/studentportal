import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import type { ProgramRound } from "@/lib/programRounds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type StudentDestination = {
  id?: string;
  display_name?: string;
  country_code?: string | null;
  pipeline_stages?: string[];
  dashboard_pipeline_stages?: DashboardStageDef[];
};

export type StudentApplication = {
  app: { id: string; current_stage: string | null; intake: string | null; round_id: string | null; is_finalized: boolean | null };
  uni: { name?: string } | null;
  dest: StudentDestination | null;
  program: { name?: string; rounds?: ProgramRound[] } | null;
};

/**
 * A student's applications with their university, destination pipeline and
 * programme rounds — read once, the same way, for the dashboard's summary and
 * the Applications page's cards, so the two cannot count differently.
 */
export async function loadStudentApplications(supabase: SupabaseClient, studentId: string): Promise<StudentApplication[]> {
  const { data } = await supabase
    .from("applications")
    .select(
      "id, current_stage, intake, round_id, is_finalized, university:universities(name, destination:destinations(id, display_name, country_code, pipeline_stages, dashboard_pipeline_stages)), program:programs(name, rounds:program_intake_rounds(id, label, start_date, application_deadline, sort_order))"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as StudentDestination | null) : null;
    const program = one(a.program as never) as StudentApplication["program"];
    return {
      app: { id: a.id, current_stage: a.current_stage, intake: a.intake, round_id: a.round_id, is_finalized: a.is_finalized },
      uni: uni ? { name: uni.name } : null,
      dest,
      program,
    };
  });
}
