import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { applicationDeadline, deadlineSource } from "@/lib/applicationDeadline";
import { compareApplications } from "@/lib/applicationTable";

/**
 * One application as the staff's applications table shows it: plain values,
 * read once by the server for both the all-applications page and a student's
 * Applications tab, and for the Excel export.
 */
export type ApplicationRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  counselorName: string | null;
  officerName: string | null;
  /** Its place among the student's applications in that intake, in their priority order: "#2", as the cards numbered them. */
  number: number;
  sortOrder: number | null;
  cycleId: string | null;
  country: string | null;
  countryCode: string | null;
  universityId: string;
  universityName: string;
  city: string | null;
  universityEmail: string | null;
  programId: string | null;
  programName: string | null;
  level: string | null;
  portalLink: string | null;
  pageLink: string | null;
  requirementsLink: string | null;
  coordinatorEmail: string | null;
  intake: string | null;
  roundId: string | null;
  roundLabel: string | null;
  /** The date that applies — the application's own, its round's, or the programme's — and which. */
  deadline: string | null;
  deadlineSource: ReturnType<typeof deadlineSource>;
  /** The date typed for this application alone, which is what the cell edits. */
  ownDeadline: string | null;
  stage: string;
  pipeline: string[];
  fee: string | null;
  feeCurrency: string | null;
  requirements: string | null;
  finalized: boolean;
  finalizeLabel: string | null;
  finalizedBadge: string | null;
  remark: string | null;
  remarkAt: string | null;
  remarkBy: string | null;
  tasksOpen: number;
  tasksTotal: number;
  createdAt: string;
  updatedAt: string;
};

/** A programme of a university, with its intake rounds, for the Programme and Round cells. */
export type ProgramOption = {
  id: string;
  name: string;
  level: string | null;
  rounds: { id: string; label: string; deadline: string | null; deadlineText: string | null }[];
};

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Raw = {
  id: string;
  student_id: string;
  current_stage: string;
  intake: string | null;
  deadline: string | null;
  application_fee: string | null;
  application_fee_currency: string | null;
  special_requirements: string | null;
  is_finalized: boolean;
  sort_order: number | null;
  cycle_id: string | null;
  round_id: string | null;
  program_id: string | null;
  university_id: string;
  created_at: string;
  updated_at: string;
  university: One<{
    id: string;
    name: string;
    city: string | null;
    contact_email: string | null;
    destination: One<{ display_name: string; country_code: string | null; pipeline_stages: string[] | null; finalize_action_label: string | null; finalized_badge_label: string | null }>;
  }>;
  program: One<{
    id: string;
    name: string;
    level: string | null;
    application_deadline: string | null;
    page_link: string | null;
    requirements_link: string | null;
    application_portal_link: string | null;
    coordinator_email: string | null;
  }>;
  round: One<{ id: string; label: string; application_deadline: string | null }>;
  student: One<{
    full_name: string;
    student_code: string | null;
    assigned_counselor: One<{ full_name: string }>;
    processing_officer: One<{ full_name: string }>;
  }>;
  remark: One<{ body: string | null; updated_at: string; editor: One<{ full_name: string }> }>;
  tasks: { status: string }[] | null;
};

const SELECT = `id, student_id, current_stage, intake, deadline, application_fee, application_fee_currency, special_requirements,
  is_finalized, sort_order, cycle_id, round_id, program_id, university_id, created_at, updated_at,
  university:universities(id, name, city, contact_email, destination:destinations(display_name, country_code, pipeline_stages, finalize_action_label, finalized_badge_label)),
  program:programs(id, name, level, application_deadline, page_link, requirements_link, application_portal_link, coordinator_email),
  round:program_intake_rounds(id, label, application_deadline),
  student:leads(full_name, student_code, assigned_counselor:staff!assigned_counselor_id(full_name), processing_officer:staff!processing_officer_id(full_name)),
  remark:application_remark_current(body, updated_at, editor:staff!application_remark_current_updated_by_fkey(full_name)),
  tasks:application_tasks(status)`;

/**
 * Every application this viewer may see — or one student's — as table rows,
 * in the table's order (offers first, rejections last), with the programmes
 * and rounds their cells can choose from.
 */
export async function loadApplicationRows(
  supabase: SupabaseClient,
  { studentId }: { studentId?: string } = {}
): Promise<{ rows: ApplicationRow[]; programsByUniversity: Record<string, ProgramOption[]> }> {
  const raw = await readAll<Raw>((from, to) => {
    let q = supabase.from("applications").select(SELECT);
    if (studentId) q = q.eq("student_id", studentId);
    return q.order("created_at").order("id").range(from, to).returns<Raw[]>();
  });

  const rows: ApplicationRow[] = raw.map((a) => {
    const uni = one(a.university);
    const dest = one(uni?.destination ?? null);
    const program = one(a.program);
    const round = one(a.round);
    const student = one(a.student);
    const remark = one(a.remark);
    const tasks = a.tasks ?? [];
    return {
      id: a.id,
      studentId: a.student_id,
      studentName: student?.full_name ?? "Unknown student",
      studentCode: student?.student_code ?? null,
      counselorName: one(student?.assigned_counselor ?? null)?.full_name ?? null,
      officerName: one(student?.processing_officer ?? null)?.full_name ?? null,
      number: 0,
      sortOrder: a.sort_order,
      cycleId: a.cycle_id,
      country: dest?.display_name ?? null,
      countryCode: dest?.country_code ?? null,
      universityId: a.university_id,
      universityName: uni?.name ?? "Unknown university",
      city: uni?.city ?? null,
      universityEmail: uni?.contact_email ?? null,
      programId: a.program_id,
      programName: program?.name ?? null,
      level: program?.level ?? null,
      portalLink: program?.application_portal_link ?? null,
      pageLink: program?.page_link ?? null,
      requirementsLink: program?.requirements_link ?? null,
      coordinatorEmail: program?.coordinator_email ?? null,
      intake: a.intake,
      roundId: a.round_id,
      roundLabel: round?.label ?? null,
      deadline: applicationDeadline(a.deadline, round?.application_deadline, program?.application_deadline),
      deadlineSource: deadlineSource(a.deadline, round?.application_deadline, program?.application_deadline),
      ownDeadline: a.deadline,
      stage: a.current_stage,
      pipeline: dest?.pipeline_stages ?? [],
      fee: a.application_fee,
      feeCurrency: a.application_fee_currency,
      requirements: a.special_requirements,
      finalized: a.is_finalized,
      finalizeLabel: dest?.finalize_action_label ?? null,
      finalizedBadge: dest?.finalized_badge_label ?? null,
      remark: remark?.body ?? null,
      remarkAt: remark?.updated_at ?? null,
      remarkBy: one(remark?.editor ?? null)?.full_name ?? null,
      tasksOpen: tasks.filter((t) => t.status !== "done" && t.status !== "completed").length,
      tasksTotal: tasks.length,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  });
  // Numbered within each student's intake in the priority staff set, then the
  // order they were made — the numbers the cards showed.
  const byIntake = new Map<string, ApplicationRow[]>();
  for (const r of rows) {
    const key = `${r.studentId}|${r.cycleId ?? ""}`;
    byIntake.set(key, [...(byIntake.get(key) ?? []), r]);
  }
  for (const list of byIntake.values()) {
    list
      .sort((x, y) => (x.sortOrder ?? Number.MAX_SAFE_INTEGER) - (y.sortOrder ?? Number.MAX_SAFE_INTEGER) || x.createdAt.localeCompare(y.createdAt))
      .forEach((r, i) => (r.number = i + 1));
  }
  rows.sort((x, y) => compareApplications(toSortable(x), toSortable(y)));

  // The programmes of the universities on the list, and their rounds.
  const universityIds = [...new Set(rows.map((r) => r.universityId))];
  type P = { id: string; name: string; level: string | null; university_id: string; rounds: { id: string; label: string; application_deadline: string | null; deadline_text: string | null; sort_order: number | null }[] | null };
  const programs = universityIds.length
    ? await readAllIn<P>(universityIds, (chunk, from, to) =>
        supabase
          .from("programs")
          .select("id, name, level, university_id, rounds:program_intake_rounds(id, label, application_deadline, deadline_text, sort_order)")
          .in("university_id", chunk)
          .order("name")
          .order("id")
          .range(from, to)
          .returns<P[]>()
      )
    : [];
  const programsByUniversity: Record<string, ProgramOption[]> = {};
  for (const p of programs) {
    (programsByUniversity[p.university_id] ??= []).push({
      id: p.id,
      name: p.name,
      level: p.level,
      rounds: [...(p.rounds ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => ({ id: r.id, label: r.label, deadline: r.application_deadline, deadlineText: r.deadline_text })),
    });
  }
  return { rows, programsByUniversity };
}

const toSortable = (r: ApplicationRow) => ({ stage: r.stage, pipeline: r.pipeline, studentName: r.studentName, sortOrder: r.sortOrder, createdAt: r.createdAt });
