// What each dashboard reads. Server-side; the summaries they feed are pure
// and tested (sales.ts, processing.ts, finance.ts, marketing.ts).
//
// Two limits that both fail without saying so, handled throughout:
//
//   * PostgREST stops at 1000 rows. Everything that is counted is read with
//     readAll, which pages until a short page comes back.
//   * .in() puts every id in the URL. Anything filtered by a list of
//     students goes through readAllIn, which sends the ids in chunks.
//
// Every read is made as the viewer, so row-level security decides what each
// person counts — a counsellor's figures are their own because the database
// only hands them their own leads. The exception is `restricted` in
// loadProcessing: visa decisions and scholarships are readable only by
// Processing and Super Admin (0012), so Management's team view reads those
// two with the service role, after the dashboard has checked the viewer is
// Management or Super Admin, and shows them only as totals.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { applicationDeadline } from "@/lib/applicationDeadline";
import { readVisaDecision } from "@/lib/visaOutcome";
import type { DashboardStageDef, DashboardStageValues } from "@/lib/dashboardPipeline";
import { buildStageRows, type StageApplication, type StageDestination } from "@/lib/stageProgress";
import type { ReportMonth } from "@/lib/leadOwners";
import { addDays } from "./dates";
import type { SalesLead, CallLog } from "./sales";
import type { ProcApplication, ProcDocument, ProcScholarship, ProcStages, ProcStudent, ProcVisa } from "./processing";
import type { FinInstallment, FinPartnerCommission, FinRefund, FinStaffCommission } from "./finance";
import type { AdCampaign, Campaign, Post, Referral } from "./marketing";

type Db = SupabaseClient;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** The first day of the oldest month on a chart, as a timestamp filter. */
function monthsStart(months: ReportMonth[]): string {
  return `${months[0]?.key ?? "2000-01"}-01`;
}

const LEAD_COLUMNS = "id, full_name, status, platform_source, created_at, registered_at, assigned_counselor_id, campaign_id";

// ------------------------------------------------------------------- sales

export async function loadSalesRows(db: Db, { counselorId, today }: { counselorId: string | null; today: string }) {
  const [leads, calls] = await Promise.all([
    readAll<SalesLead & { campaign_id: string | null }>((from, to) => {
      let q = db.from("leads").select(LEAD_COLUMNS).order("id").range(from, to);
      if (counselorId) q = q.eq("assigned_counselor_id", counselorId);
      return q;
    }),
    // Enough history to tell who has gone quiet; RLS keeps it to leads they can see.
    readAll<CallLog>((from, to) =>
      db.from("lead_call_logs").select("lead_id, created_at").gte("created_at", addDays(today, -60)).order("id").range(from, to)
    ),
  ]);
  return { leads, calls };
}

export async function loadFollowUpTasks(db: Db, ownerId: string, today: string) {
  const { data } = await db
    .from("personal_tasks")
    .select("id, title, due_date, student_id, source")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .lte("due_date", today)
    .order("due_date")
    .limit(8);
  return data ?? [];
}

export async function loadCounselors(db: Db) {
  const { data } = await db.from("staff").select("id, full_name, monthly_target").contains("roles", ["counselor"]).eq("status", "active").order("full_name");
  return (data ?? []) as { id: string; full_name: string; monthly_target: number | null }[];
}

/** A counsellor's registered students and how far each has got — read-only progress. */
export async function loadStudentProgress(db: Db, counselorId: string) {
  const students = await readAll<{ id: string; full_name: string | null }>((from, to) =>
    db
      .from("students")
      .select("id, full_name")
      .eq("assigned_counselor_id", counselorId)
      .eq("registration_status", "registered")
      .order("id")
      .range(from, to)
  );
  const rows = await stageRowsFor(
    db,
    students.map((s) => s.id)
  );
  const nameOf = new Map(students.map((s) => [s.id, s.full_name ?? "Student"]));
  return { students: students.length, rows: rows.map((r) => ({ ...r, studentName: nameOf.get(r.studentId) ?? "Student" })) };
}

/** Every student's country-stage rows, built the way their record builds them (buildStageRows). */
async function stageRowsFor(db: Db, studentIds: string[]): Promise<ProcStages[]> {
  if (studentIds.length === 0) return [];
  type Dest = { id?: string; display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] | null };
  const [destinations, applications] = await Promise.all([
    readAllIn<{ lead_id: string; destination_id: string; dashboard_stage_values: DashboardStageValues | null; destination: unknown }>(studentIds, (chunk, from, to) =>
      db
        .from("lead_destinations")
        .select("lead_id, destination_id, dashboard_stage_values, destination:destinations(id, display_name, dashboard_pipeline_stages)")
        .in("lead_id", chunk)
        // No id column: the pair is the key, and paging needs a unique order.
        .order("lead_id")
        .order("destination_id")
        .range(from, to)
    ),
    readAllIn<{ id: string; student_id: string; university: unknown }>(studentIds, (chunk, from, to) =>
      db
        .from("applications")
        .select("id, student_id, university:universities(name, destination:destinations(id, display_name, dashboard_pipeline_stages))")
        .in("student_id", chunk)
        .order("id")
        .range(from, to)
    ),
  ]);

  const appsBy = new Map<string, StageApplication[]>();
  for (const a of applications) {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = one(uni?.destination as never) as Dest | null;
    if (!dest?.id) continue;
    const list = appsBy.get(a.student_id) ?? [];
    list.push({ destinationId: dest.id, destinationName: dest.display_name ?? "", stages: dest.dashboard_pipeline_stages ?? [], universityName: uni?.name ?? "" });
    appsBy.set(a.student_id, list);
  }
  const destBy = new Map<string, StageDestination[]>();
  for (const d of destinations) {
    const dest = one(d.destination as never) as Dest | null;
    const list = destBy.get(d.lead_id) ?? [];
    list.push({ destinationId: d.destination_id, destinationName: dest?.display_name ?? "", stages: dest?.dashboard_pipeline_stages ?? [], values: d.dashboard_stage_values ?? {} });
    destBy.set(d.lead_id, list);
  }
  return studentIds.flatMap((id) =>
    buildStageRows(appsBy.get(id) ?? [], destBy.get(id) ?? []).map((r) => ({ studentId: id, destinationName: r.destinationName, stages: r.stages, values: r.values }))
  );
}

// -------------------------------------------------------------- processing

export async function loadProcessingRows(
  db: Db,
  { officerId, restricted }: { officerId: string | null; restricted: Db }
): Promise<{
  students: ProcStudent[];
  applications: ProcApplication[];
  documents: ProcDocument[];
  visas: ProcVisa[];
  scholarships: ProcScholarship[];
  stages: ProcStages[];
}> {
  const students = await readAll<ProcStudent>((from, to) => {
    let q = db.from("students").select("id, full_name, processing_officer_id").eq("registration_status", "registered").order("id").range(from, to);
    if (officerId) q = q.eq("processing_officer_id", officerId);
    return q;
  });
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return { students, applications: [], documents: [], visas: [], scholarships: [], stages: [] };

  const [rawApps, documents, scholarships, stages] = await Promise.all([
    readAllIn<{ id: string; student_id: string; current_stage: string | null; deadline: string | null; university: unknown; program: unknown; round: unknown }>(ids, (chunk, from, to) =>
      db
        .from("applications")
        .select(
          "id, student_id, current_stage, deadline, university:universities(name, destination:destinations(country_code, pipeline_stages)), program:programs(application_deadline), round:program_intake_rounds(application_deadline)"
        )
        .in("student_id", chunk)
        .order("id")
        .range(from, to)
    ),
    readAllIn<ProcDocument>(ids, (chunk, from, to) =>
      db
        .from("student_documents")
        .select("id, student_id, status, uploaded_at, verified_at")
        .in("student_id", chunk)
        .in("status", ["submitted", "under_review", "verified"])
        .order("id")
        .range(from, to)
    ),
    readAllIn<ProcScholarship>(ids, (chunk, from, to) =>
      restricted.from("student_scholarships").select("student_id, status, application_deadline, name").in("student_id", chunk).order("id").range(from, to)
    ),
    stageRowsFor(db, ids),
  ]);

  const applications: ProcApplication[] = rawApps.map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = one(uni?.destination as never) as { pipeline_stages?: string[] | null } | null;
    const program = one(a.program as never) as { application_deadline?: string | null } | null;
    const round = one(a.round as never) as { application_deadline?: string | null } | null;
    return {
      id: a.id,
      student_id: a.student_id,
      current_stage: a.current_stage,
      pipelineStages: dest?.pipeline_stages ?? [],
      deadline: applicationDeadline(a.deadline, round?.application_deadline, program?.application_deadline),
      universityName: uni?.name ?? "University",
    };
  });

  const visas = await loadVisaDecisions(restricted, rawApps);
  return { students, applications, documents, visas, scholarships, stages };
}

/**
 * The visa decision on each application, from the tracker field its country
 * marks as the outcome (visa_role 'outcome') — the same source
 * listVisaDecisions reads, but only for these applications and paged.
 */
async function loadVisaDecisions(db: Db, apps: { id: string; student_id: string; university: unknown }[]): Promise<ProcVisa[]> {
  const { data: defs } = await db.from("tracker_definitions").select("country_code, field_key").eq("visa_role", "outcome");
  const keyByCountry = new Map((defs ?? []).map((d) => [d.country_code as string, d.field_key as string]));
  if (keyByCountry.size === 0 || apps.length === 0) return [];
  const values = await readAllIn<{ application_id: string; field_key: string; field_value: string | null; updated_at: string | null }>(
    apps.map((a) => a.id),
    (chunk, from, to) =>
      db
        .from("application_country_extra")
        .select("application_id, field_key, field_value, updated_at")
        .in("application_id", chunk)
        .in("field_key", [...new Set(keyByCountry.values())])
        .order("id")
        .range(from, to)
  );
  const valueFor = new Map(values.map((v) => [`${v.application_id}:${v.field_key}`, v]));
  return apps.flatMap((a) => {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const code = (one(uni?.destination as never) as { country_code?: string } | null)?.country_code;
    const key = code ? keyByCountry.get(code) : undefined;
    if (!key) return [];
    const v = valueFor.get(`${a.id}:${key}`);
    return [{ studentId: a.student_id, decision: readVisaDecision(v?.field_value), decidedAt: v?.updated_at ?? null }];
  });
}

export async function loadOfficers(db: Db) {
  const { data } = await db.from("staff").select("id, full_name").contains("roles", ["processing"]).eq("status", "active").order("full_name");
  return (data ?? []) as { id: string; full_name: string }[];
}

// ----------------------------------------------------------------- finance

export async function loadFinanceRows(db: Db, { months }: { months: ReportMonth[] }) {
  const since = monthsStart(months);
  const [rawInstallments, refunds, partnerCommissions, staffCommissions, unsent] = await Promise.all([
    // Everything still owed, and everything paid within the chart's months.
    readAll<{ amount: number | string | null; amount_paid: number | string | null; status: string | null; due_date: string | null; paid_date: string | null; invoice: unknown }>(
      (from, to) =>
        db
          .from("invoice_installments")
          .select("amount, amount_paid, status, due_date, paid_date, invoice:invoices(currency, student_id, student:leads(full_name))")
          .or(`status.neq.paid,paid_date.gte.${since}`)
          .order("id")
          .range(from, to)
    ),
    readAll<FinRefund>((from, to) => db.from("refund_requests").select("status, amount, currency").in("status", ["requested", "approved"]).order("id").range(from, to)),
    readAll<FinPartnerCommission>((from, to) =>
      db.from("partner_commissions").select("status, expected_amount, paid_fee, currency, received_date").order("id").range(from, to)
    ),
    readAll<FinStaffCommission>((from, to) => db.from("staff_commissions").select("status, amount, currency").eq("status", "unpaid").order("id").range(from, to)),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("sent_status", "unsent"),
  ]);
  const installments: FinInstallment[] = rawInstallments.map((i) => {
    const inv = one(i.invoice as never) as { currency?: string; student_id?: string; student?: unknown } | null;
    const student = one(inv?.student as never) as { full_name?: string } | null;
    return {
      amount: i.amount,
      amount_paid: i.amount_paid,
      status: i.status,
      due_date: i.due_date,
      paid_date: i.paid_date,
      currency: inv?.currency ?? "EUR",
      studentId: inv?.student_id ?? null,
      studentName: student?.full_name ?? null,
    };
  });
  return { installments, refunds, partnerCommissions, staffCommissions, unsentInvoices: unsent.count ?? 0 };
}

// --------------------------------------------------------------- marketing

export async function loadSocialRows(db: Db, { today }: { today: string }) {
  const [posts, ads] = await Promise.all([
    readAll<Post>((from, to) =>
      db
        .from("social_calendar_posts")
        .select("id, theme, post_date, status, platforms")
        .gte("post_date", addDays(today, -200))
        .lte("post_date", addDays(today, 60))
        .order("id")
        .range(from, to)
    ),
    readAll<AdCampaign>((from, to) => db.from("ad_campaigns").select("id, platform, country, planned_spend, actual_spend, start_date, end_date").order("id").range(from, to)),
  ]);
  return { posts, ads };
}

export async function loadLeadGenRows(db: Db, { months }: { months: ReportMonth[] }) {
  const since = monthsStart(months);
  const [leads, campaigns, referrals] = await Promise.all([
    readAll<SalesLead & { campaign_id: string | null }>((from, to) => db.from("leads").select(LEAD_COLUMNS).gte("created_at", since).order("id").range(from, to)),
    readAll<Campaign>((from, to) => db.from("campaigns").select("id, name, type, event_date_start, actual_spend, budget").order("id").range(from, to)),
    readAll<Referral>((from, to) => db.from("referrals").select("incentive_status, incentive_owed, currency").eq("incentive_status", "owed").order("id").range(from, to)),
  ]);
  const leadCampaign = new Map(leads.filter((l) => l.campaign_id).map((l) => [l.id, l.campaign_id as string]));
  return { leads, campaigns, referrals, leadCampaign };
}

// ---------------------------------------------------------------- overview

export async function loadTeamToday(db: Db, today: string) {
  const [{ count: activeStaff }, attendance, { count: leavePending }, { count: ticketsOpen }] = await Promise.all([
    db.from("staff").select("id", { count: "exact", head: true }).eq("status", "active"),
    readAll<{ staff_id: string; late_flag: boolean | null }>((from, to) =>
      db.from("attendance_records").select("staff_id, late_flag").eq("work_date", today).order("id").range(from, to)
    ),
    db.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "resolved"),
  ]);
  const present = new Set(attendance.map((a) => a.staff_id));
  const late = new Set(attendance.filter((a) => a.late_flag).map((a) => a.staff_id));
  return { activeStaff: activeStaff ?? 0, present: present.size, late: late.size, leavePending: leavePending ?? 0, ticketsOpen: ticketsOpen ?? 0 };
}
