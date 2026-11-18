import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadApplicationRows } from "@/lib/applicationRows";
import { firstSubmittedAt, type StageEntry } from "@/lib/applicationSubmissionOrder";
import type { AppReportInput } from "./applicationsStatusReport";

/** Registered students for the Student dropdown, by name. */
export async function loadRegisteredStudents(supabase: SupabaseClient): Promise<{ id: string; name: string; code: string | null }[]> {
  const { data } = await supabase.from("students").select("id, full_name, student_code").order("full_name");
  return (data ?? []).map((s) => ({ id: s.id as string, name: ((s.full_name as string | null) ?? "").trim() || "Unnamed student", code: (s.student_code as string | null) ?? null }));
}

/** Every application (or one student's) with when it was first submitted, from its stage history. */
export async function loadAppReportInput(supabase: SupabaseClient, studentId?: string): Promise<AppReportInput[]> {
  const { rows } = await loadApplicationRows(supabase, { studentId: studentId || undefined, withPrograms: false });
  const ids = rows.map((r) => r.id);
  const historyOf = new Map<string, StageEntry[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("application_stage_history").select("application_id, stage, entered_at").in("application_id", ids.slice(i, i + 200));
    for (const h of data ?? []) {
      const list = historyOf.get(h.application_id as string) ?? [];
      list.push({ stage: h.stage as string, enteredAt: h.entered_at as string });
      historyOf.set(h.application_id as string, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    studentName: r.studentName,
    studentCode: r.studentCode,
    universityName: r.universityName,
    programName: r.programName,
    level: r.level,
    country: r.country,
    intake: r.intake,
    roundLabel: r.roundLabel,
    deadline: r.deadline,
    stage: r.stage,
    pipeline: r.pipeline,
    createdAt: r.createdAt,
    submittedAt: firstSubmittedAt({ stage: r.stage, pipeline: r.pipeline, createdAt: r.createdAt }, historyOf.get(r.id) ?? []),
  }));
}
