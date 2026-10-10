import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRole } from "@/lib/auth/roles";
import { canSeeVisaSection } from "@/lib/visaAccess";
import { loadApplicationRows } from "@/lib/applicationRows";
import { loadCycleDocuments } from "@/lib/studentCycleDocuments";
import { loadStudentChecklistSections } from "@/lib/studentChecklistSections";
import { CATEGORY_LABELS, sectionOfCategory } from "@/lib/documentCategories";
import { orderCycles, type Cycle } from "@/lib/intakeCycle";
import { agreementCountry } from "@/lib/agreementLabel";
import { destinationStatusRows, type RegisteredDestination, type AppliedDestination } from "@/lib/destinationStatus";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { universityShortName } from "@/lib/finalizedStage";
import { interviewTimes, platformLabel } from "@/lib/interviews";
import { testLabel } from "@/lib/testScores";
import { trackerSelectedTests } from "@/lib/trackerTests";
import { scholarshipGate } from "@/lib/scholarshipGate";
import { visaOutcomes } from "@/lib/studentVisaApproval";
import { readVisaDecision } from "@/lib/visaOutcome";
import { credentialLabel, inCredentialsSection } from "@/lib/studentCredentials";
import { SERVICE_FEE_TITLE, SERVICE_SHORT, serviceOf } from "@/lib/serviceType";
import { karachiToday } from "@/lib/calendarDates";
import { remarkWhen } from "@/lib/leadRemarks";
import type { QualificationType } from "@/lib/qualifications";
import {
  agreementSection,
  applicationsSection,
  day,
  dayOf,
  documentsSection,
  interviewsSection,
  journeySection,
  karachiDate,
  paymentsSection,
  registrationSection,
  scholarshipSection,
  summariseReport,
  tasksSection,
  trackerSection,
  travelSection,
  visaSection,
  type ReportRemark,
  type ReportSection,
  type ReportSummary,
  type TaskInput,
  type TestInput,
  type TrackerFieldInput,
  type TravelInput,
  type VisaInput,
} from "@/lib/studentReport";

type StaffRow = Parameters<typeof hasRole>[0] & { id: string; full_name: string };

export type TeamLine = { name: string; designation: string | null; phone: string | null; email: string | null };

export type StudentReportData = {
  student: {
    name: string;
    code: string | null;
    legacyCodes: string[];
    intake: string | null;
    service: string;
    registration: string;
    registeredOn: string | null;
    email: string | null;
    phone: string | null;
    primary: string | null;
    backups: string[];
    finalized: string | null;
    previousIntakes: number;
    counsellor: TeamLine | null;
    officer: TeamLine | null;
  };
  sections: ReportSection[];
  remarks: ReportRemark[];
  summary: ReportSummary;
  /** What this viewer's role leaves out of the report, said on its first page. */
  withheld: string | null;
  preparedBy: string;
  preparedAt: string;
  today: string;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const REGISTRATION_WORDS: Record<string, string> = {
  registered: "Registered",
  withdrawn: "Withdrawn",
  ghost: "Ghost — not responding",
};

const REMINDER_WORDS: Record<string, string> = {
  stall: "Stalled — check in",
  deadline: "Deadline reminder",
  follow_up: "Follow-up",
};

/**
 * Everything on a registered student's record, for their status report.
 *
 * Read through the viewer's own session, so row-level security decides what
 * is in it exactly as it decides what their tabs show. Nothing here writes:
 * the Dashboard brings the document checklist up to date
 * (ensureStudentDocumentRequirements); the report reports it as it stands.
 *
 * Null when the student is not there, or not this viewer's to see.
 */
export async function loadStudentReport(supabase: SupabaseClient, studentId: string, viewer: StaffRow): Promise<StudentReportData | null> {
  const today = karachiToday();
  const seesVisa = canSeeVisaSection(viewer);

  const [
    { data: student },
    { data: lead },
    { data: profile },
    { data: qualifications },
    { data: registered },
    { data: agreements },
    { data: invoices },
    { rows: allApplications },
    { data: journeyApps },
    cycleDocs,
    checklistSections,
    { data: files },
    { data: interviews },
    { data: testScores },
    { data: trackerDefs },
    { data: trackerValues },
    { data: scholarships },
    { data: bodyLinks },
    { data: appTasks },
    { data: reminders },
    { data: personalTasks },
    { data: stageHistory },
    { data: credentialTypes },
    { data: travelChecks },
    outcomes,
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        `id, full_name, email, contact_number, country_of_interest, portal_active, auth_user_id, registration_status, student_code, intake, legacy_student_codes, date_of_birth, address,
         counsellor:staff!assigned_counselor_id(full_name, designation, mobile_official, email_official),
         officer:staff!processing_officer_id(full_name, designation, mobile_official, email_official)`
      )
      .eq("id", studentId)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("registered_at, service_type, level_applying_for, remark:lead_remark_current(body, updated_at, editor:staff!lead_remark_current_updated_by_fkey(full_name))")
      .eq("id", studentId)
      .maybeSingle(),
    supabase
      .from("student_profiles")
      .select("emergency_contact_name, emergency_contact_number, passport_number, passport_expiry, cnic, financial_sponsor_name, financial_sponsor_relation, financial_details")
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase.from("student_qualifications").select("qualification_type").eq("student_id", studentId),
    supabase
      .from("lead_destinations")
      .select("destination_id, is_backup, created_at, dashboard_stage_values, destination:destinations(display_name, country_code, dashboard_pipeline_stages)")
      .eq("lead_id", studentId),
    supabase
      .from("agreements")
      .select(
        "id, status, version, signing_method, agreement_date, created_at, generated_by, signed_file_uploaded_at, video_uploaded_at, document_status, video_status, document_review_note, video_review_note, reviewed_at, reviewed_by, approval_undone_at, destination:destinations(country), template:agreement_templates(destination:destinations(country))"
      )
      .eq("student_id", studentId)
      .order("created_at"),
    // The schedule, the added items, each country's administrative fee and
    // each email sent, with the invoice they belong to.
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, currency, issued_on, created_at, generated_by, consultancy_fee, admin_charge, discount_amount, discount_reason, tax_rate, tax_base, service_type,
         installments:invoice_installments(installment_no, amount, amount_paid, status, due_date, paid_date, payment_method, due_condition),
         items:invoice_line_items(name, amount),
         charges:invoice_admin_charges(country_label, amount, is_backup, sort_order),
         emails:invoice_email_log(sent_to, status, created_at, sent_by)`
      )
      .eq("student_id", studentId)
      .order("created_at"),
    loadApplicationRows(supabase, { studentId }),
    // What the country bar and the scholarship gate need of each application:
    // its destination, which the table's rows do not carry.
    supabase
      .from("applications")
      .select("id, is_finalized, preenrollment_finalized, university:universities(name, short_name, destination:destinations(id, display_name, country_code, dashboard_pipeline_stages))")
      .eq("student_id", studentId),
    // The current intake's documents, as the Documents tab lists them.
    loadCycleDocuments(supabase, studentId),
    loadStudentChecklistSections(supabase, studentId),
    supabase.from("student_document_files").select("document_id").eq("student_id", studentId),
    supabase
      .from("application_interviews")
      .select("application_id, round_label, status, confirmed_datetime, timezone, platform, platform_other, created_by, application:applications!inner(student_id)")
      .eq("application.student_id", studentId)
      .order("confirmed_datetime", { ascending: true, nullsFirst: false }),
    supabase.from("student_test_scores").select("test_type, score, test_date, custom_test_name, created_at").eq("student_id", studentId),
    supabase
      .from("tracker_definitions")
      .select("country_code, field_key, label, field_type, options, show_if_key, show_if_equals, visa_role, is_appointment, sort_order")
      .order("sort_order"),
    supabase
      .from("application_country_extra")
      .select("application_id, field_key, field_value, application:applications!inner(student_id)")
      .eq("application.student_id", studentId),
    supabase.from("student_scholarships").select("name, status, documents_status, award_amount, application_deadline, application_id, cycle_id").eq("student_id", studentId),
    supabase.from("scholarship_body_destinations").select("destination_id"),
    supabase
      .from("application_tasks")
      .select("description, due_date, status, priority, application_id, owner_id, application:applications!inner(student_id)")
      .eq("application.student_id", studentId),
    supabase.from("reminders").select("type, due_date, note, resolved, created_by").eq("student_id", studentId),
    // Only those this viewer may see: a colleague's own tasks are theirs (0071).
    supabase.from("personal_tasks").select("title, due_date, status, priority, owner_id").eq("student_id", studentId),
    supabase
      .from("application_stage_history")
      .select("application_id, stage, entered_at, changed_by, application:applications!inner(student_id)")
      .eq("application.student_id", studentId)
      .order("entered_at", { ascending: false }),
    // The names of the logins kept for them; never what they hold.
    supabase.rpc("list_credential_types", { p_owner_type: "student", p_owner_id: studentId }),
    supabase.from("student_travel_checks").select("item_id, checked_at").eq("student_id", studentId),
    seesVisa ? visaOutcomes(supabase, studentId) : Promise.resolve([]),
  ]);

  if (!student) return null;

  // ------------------------------------------------------------ the intake
  const cycles = orderCycles(cycleDocs.cycles as Cycle[]);
  const showCycles = cycles.length > 1;
  const currentCycleId = cycles.find((c) => c.is_current)?.id ?? cycles[0]?.id ?? null;
  const firstCycleId = cycles.at(-1)?.id ?? null;
  const inCurrent = (cycleId: string | null | undefined) => !showCycles || (cycleId ?? firstCycleId) === currentCycleId;
  // This intake's applications, numbered in the priority staff set.
  const applications = allApplications.filter((r) => inCurrent(r.cycleId));
  [...applications]
    .sort((x, y) => (x.sortOrder ?? Number.MAX_SAFE_INTEGER) - (y.sortOrder ?? Number.MAX_SAFE_INTEGER) || x.createdAt.localeCompare(y.createdAt))
    .forEach((r, i) => (r.number = i + 1));
  const currentAppIds = new Set(applications.map((a) => a.id));
  const universityOf = new Map(allApplications.map((a) => [a.id, a.universityName]));

  // ------------------------------------------------------------ who did what
  const staffIds = new Set<string>();
  const want = (v: unknown) => {
    if (typeof v === "string" && v) staffIds.add(v);
  };
  for (const a of agreements ?? []) {
    want(a.generated_by);
    want(a.reviewed_by);
  }
  for (const inv of invoices ?? []) {
    want(inv.generated_by);
    for (const e of (inv.emails ?? []) as { sent_by: string | null }[]) want(e.sent_by);
  }
  for (const d of cycleDocs.docs) want(d.verified_by);
  for (const i of interviews ?? []) want(i.created_by);
  for (const t of appTasks ?? []) want(t.owner_id);
  for (const r of reminders ?? []) want(r.created_by);
  for (const t of personalTasks ?? []) want(t.owner_id);
  for (const h of stageHistory ?? []) want(h.changed_by);

  const approvedVisas = outcomes.filter((o) => o.decision === "approved" && allApplications.some((a) => a.id === o.applicationId && a.finalized));
  const [{ data: staffNames }, { data: guideSections }] = await Promise.all([
    staffIds.size ? supabase.from("staff").select("id, full_name").in("id", [...staffIds]) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    seesVisa && approvedVisas.length
      ? supabase
          .from("travel_guide_sections")
          .select("title, sort_order, destination_id, items:travel_guide_items(id, label, sort_order)")
          .in("destination_id", approvedVisas.map((v) => v.destinationId))
          .order("sort_order")
      : Promise.resolve({ data: [] as { title: string; sort_order: number; destination_id: string; items: { id: string; label: string; sort_order: number }[] }[] }),
  ]);
  const nameOf = new Map((staffNames ?? []).map((s) => [s.id as string, s.full_name as string]));
  const who = (id: unknown) => (typeof id === "string" ? (nameOf.get(id) ?? null) : null);

  // ------------------------------------------------------------ registration
  const destinations = (registered ?? [])
    .map((r) => ({ row: r, dest: one(r.destination as never) as { display_name?: string; country_code?: string | null; dashboard_pipeline_stages?: DashboardStageDef[] } | null }))
    .filter((r) => r.dest?.display_name)
    .sort((a, b) => Number(a.row.is_backup) - Number(b.row.is_backup) || String(a.row.created_at ?? "").localeCompare(String(b.row.created_at ?? "")));
  // A student from before backups existed may hold two primaries; the earliest is the primary.
  const primaryRow = destinations.find((d) => !d.row.is_backup) ?? null;
  const destinationList = destinations.map((d) => ({ name: d.dest!.display_name!, isBackup: d !== primaryRow }));
  const service = serviceOf(lead?.service_type);
  const savedLogins = ((credentialTypes ?? []) as string[]).filter(inCredentialsSection).map((t) => credentialLabel(t));

  const sections: ReportSection[] = [];
  sections.push(
    registrationSection({
      registrationStatus: student.registration_status as string | null,
      registeredAt: (lead?.registered_at as string | null) ?? null,
      intake: student.intake as string | null,
      studentCode: student.student_code as string | null,
      hasCountry: destinationList.length > 0,
      destinations: destinationList,
      service,
      portal: { hasLogin: Boolean(student.auth_user_id), active: Boolean(student.portal_active) },
      profile: {
        contact_number: student.contact_number as string | null,
        date_of_birth: student.date_of_birth as string | null,
        address: student.address as string | null,
        ...((profile ?? {}) as object),
      },
      level: (lead?.level_applying_for as string | null) ?? null,
      qualifications: (qualifications ?? []).map((q) => q.qualification_type as QualificationType),
      savedLogins,
    })
  );

  // ------------------------------------------------------------ agreement
  sections.push(
    agreementSection(
      (agreements ?? []).map((a) => ({
        id: a.id as string,
        country: agreementCountry(a as never),
        version: a.version as number | null,
        status: a.status as string | null,
        signingMethod: a.signing_method as string | null,
        agreementDate: a.agreement_date as string | null,
        createdAt: a.created_at as string | null,
        generatedBy: who(a.generated_by),
        signedUploadedAt: a.signed_file_uploaded_at as string | null,
        videoUploadedAt: a.video_uploaded_at as string | null,
        documentStatus: a.document_status as string | null,
        videoStatus: a.video_status as string | null,
        documentNote: a.document_review_note as string | null,
        videoNote: a.video_review_note as string | null,
        reviewedAt: a.reviewed_at as string | null,
        reviewedBy: who(a.reviewed_by),
        approvalUndoneAt: a.approval_undone_at as string | null,
      }))
    )
  );

  // ------------------------------------------------------------ invoice & payments
  type Inst = { installment_no: number; amount: number | null; amount_paid: number | null; status: string | null; due_date: string | null; paid_date: string | null; payment_method: string | null; due_condition: string | null };
  sections.push(
    paymentsSection(
      (invoices ?? []).map((inv) => ({
        number: inv.invoice_number as string | null,
        currency: inv.currency as string | null,
        issuedOn: inv.issued_on as string | null,
        createdAt: inv.created_at as string | null,
        generatedBy: who(inv.generated_by),
        consultancyFee: inv.consultancy_fee as number | null,
        adminCharge: inv.admin_charge as number | null,
        adminCharges: [...((inv.charges ?? []) as { country_label: string; amount: number | null; is_backup: boolean; sort_order: number | null }[])]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((c) => ({ label: c.country_label, amount: c.amount, isBackup: c.is_backup })),
        discountAmount: inv.discount_amount as number | null,
        discountReason: inv.discount_reason as string | null,
        taxRate: inv.tax_rate as number | null,
        taxBase: inv.tax_base as string | null,
        feeName: SERVICE_FEE_TITLE[serviceOf(inv.service_type)],
        lineItems: ((inv.items ?? []) as { name: string; amount: number | null }[]).map((li) => ({ name: li.name, amount: li.amount })),
        installments: ((inv.installments ?? []) as Inst[]).map((i) => ({
          installmentNo: i.installment_no,
          amount: i.amount,
          amountPaid: i.amount_paid,
          status: i.status,
          dueDate: i.due_date,
          paidDate: i.paid_date,
          paymentMethod: i.payment_method,
          dueCondition: i.due_condition,
        })),
        emails: [...((inv.emails ?? []) as { sent_to: string | null; status: string | null; created_at: string | null; sent_by: string | null }[])]
          .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
          .map((e) => ({ sentTo: e.sent_to, at: e.created_at, by: who(e.sent_by), status: e.status })),
      })),
      today
    )
  );

  // ------------------------------------------------------------ documents
  const sectionLabel = new Map(checklistSections.map((s) => [s.key, s.label]));
  const fileCount = new Map<string, number>();
  for (const f of files ?? []) fileCount.set(f.document_id as string, (fileCount.get(f.document_id as string) ?? 0) + 1);
  sections.push(
    documentsSection(
      cycleDocs.docs.map((d) => {
        const key = sectionOfCategory(d.category as string | null);
        const base = (d.custom_name as string | null) ?? (one(d.template as never) as { name?: string } | null)?.name ?? (d.category as string | null) ?? "Document";
        const uni = d.application_id ? universityOf.get(d.application_id as string) : null;
        return {
          name: uni ? `${base} — ${uni}` : base,
          section: sectionLabel.get(key) ?? CATEGORY_LABELS[key] ?? key,
          status: d.status as string,
          // A document filed before files had rows of their own (0328) still has its one.
          files: fileCount.get(d.id as string) ?? (d.file_path ? 1 : 0),
          uploadedAt: d.uploaded_at as string | null,
          uploadedByRole: d.uploaded_by_role as string | null,
          verifiedAt: d.verified_at as string | null,
          verifiedBy: who(d.verified_by),
          rejectedReason: d.rejected_reason as string | null,
          deadline: d.deadline as string | null,
          carriedFrom: cycleDocs.inheritedFromById.get(d.id as string) ?? null,
        };
      }),
      checklistSections.map((s) => s.label),
      today
    )
  );

  // ------------------------------------------------------------ applications
  const stageSet = new Map<string, { at: string | null; by: string | null }>();
  for (const h of stageHistory ?? []) {
    const app = allApplications.find((a) => a.id === h.application_id);
    // The newest entry into the stage it stands on now.
    if (!app || stageSet.has(app.id) || h.stage !== app.stage) continue;
    stageSet.set(app.id, { at: h.entered_at as string | null, by: who(h.changed_by) });
  }
  sections.push(
    applicationsSection(
      applications.map((a) => ({
        number: a.number,
        university: a.universityName,
        program: a.programName,
        round: a.roundLabel,
        country: a.country,
        stage: a.stage,
        pipeline: a.pipeline,
        deadline: a.deadline,
        finalized: a.finalized,
        finalizedBadge: a.finalizedBadge,
        tasksOpen: a.tasksOpen,
        tasksTotal: a.tasksTotal,
        stageSetAt: stageSet.get(a.id)?.at ?? null,
        stageSetBy: stageSet.get(a.id)?.by ?? null,
      })),
      service === "visa_only",
      today
    )
  );

  // ------------------------------------------------------------ country journey
  type JourneyDest = { id?: string; display_name?: string; country_code?: string | null; dashboard_pipeline_stages?: DashboardStageDef[] };
  const finalizedByDestination = new Map<string, { short: string; full: string }>();
  const appliedRows: AppliedDestination[] = [];
  for (const a of journeyApps ?? []) {
    const uni = one(a.university as never) as { name?: string; short_name?: string | null; destination?: unknown } | null;
    const dest = one(uni?.destination as never) as JourneyDest | null;
    if (!dest?.id) continue;
    if (a.is_finalized && uni?.name) finalizedByDestination.set(dest.id, { short: universityShortName(uni.name, uni.short_name ?? null), full: uni.name });
    appliedRows.push({ destinationId: dest.id, name: dest.display_name ?? "Destination", code: dest.country_code ?? null, stages: dest.dashboard_pipeline_stages ?? [], university: uni?.name ?? "University" });
  }
  const registeredRows: RegisteredDestination[] = destinations.map((d) => ({
    destinationId: d.row.destination_id as string,
    isBackup: d !== primaryRow,
    createdAt: d.row.created_at as string | null,
    values: (d.row.dashboard_stage_values as Record<string, string> | null) ?? null,
    name: d.dest!.display_name!,
    code: d.dest!.country_code ?? null,
    stages: d.dest!.dashboard_pipeline_stages ?? [],
  }));
  const journey = destinationStatusRows(
    registeredRows.map((r) => ({ ...r, finalizedUniversity: finalizedByDestination.get(r.destinationId) ?? null })),
    appliedRows.map((r) => ({ ...r, finalizedUniversity: finalizedByDestination.get(r.destinationId) ?? null }))
  ).filter((row) => row.total > 0);
  sections.push(journeySection(journey));

  // ------------------------------------------------------------ documentation tracker
  // One tracker per country, kept on the country's first application — as the
  // Dashboard keeps it.
  type Def = { country_code: string; field_key: string; label: string; field_type: string; options: string[] | null; show_if_key: string | null; show_if_equals: string | null; visa_role: string | null; is_appointment: boolean | null };
  const defs = (trackerDefs ?? []) as Def[];
  const valuesByApp = new Map<string, Record<string, string>>();
  for (const v of trackerValues ?? []) {
    const map = valuesByApp.get(v.application_id as string) ?? {};
    map[v.field_key as string] = (v.field_value as string | null) ?? "";
    valuesByApp.set(v.application_id as string, map);
  }
  const trackerAppByCountry = new Map<string, { appId: string; name: string }>();
  for (const a of [...allApplications].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    if (a.countryCode && !trackerAppByCountry.has(a.countryCode)) trackerAppByCountry.set(a.countryCode, { appId: a.id, name: a.country ?? a.countryCode });
  }
  const names = Object.fromEntries(allApplications.map((a) => [a.id, a.universityName]));
  const fieldOf = (d: Def): TrackerFieldInput => ({
    key: d.field_key,
    label: d.label,
    type: d.field_type,
    showWhen: d.show_if_key ? { key: d.show_if_key, equals: d.show_if_equals ?? "" } : undefined,
  });
  sections.push(
    trackerSection(
      [...trackerAppByCountry.entries()]
        .map(([code, entry]) => ({ name: entry.name, fields: defs.filter((d) => d.country_code === code).map(fieldOf), values: valuesByApp.get(entry.appId) ?? {}, names }))
        .filter((c) => c.fields.length > 0)
    )
  );

  // ------------------------------------------------------------ interviews & tests
  const ticked = trackerSelectedTests(
    defs.map((d) => ({ field_key: d.field_key, options: d.options })),
    (trackerValues ?? []).map((v) => ({ field_key: v.field_key as string, field_value: v.field_value as string | null }))
  );
  // One line per test: an "Other" test is told apart by the name typed for it.
  const testKey = (type: string, name: string | null | undefined) => (type === "other" ? `other:${(name ?? "").trim().toLowerCase()}` : type);
  const scoresByTest = new Map<string, { label: string; ticked: boolean; scores: { score: string | null; date: string | null; created: string }[] }>();
  for (const t of ticked) scoresByTest.set(testKey(t.type, t.name), { label: testLabel(t.type, t.name), ticked: true, scores: [] });
  for (const s of testScores ?? []) {
    const key = testKey(s.test_type as string, s.custom_test_name as string | null);
    if (!scoresByTest.has(key)) scoresByTest.set(key, { label: testLabel(s.test_type as string, s.custom_test_name as string | null), ticked: false, scores: [] });
    scoresByTest.get(key)!.scores.push({ score: s.score as string | null, date: s.test_date as string | null, created: String(s.created_at ?? "") });
  }
  const tests: TestInput[] = [...scoresByTest.values()].map((t) => ({
    label: t.label,
    ticked: t.ticked,
    scores: [...t.scores]
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.created.localeCompare(a.created))
      .map(({ score, date }) => ({ score, date })),
  }));
  sections.push(
    interviewsSection(
      (interviews ?? [])
        .filter((i) => currentAppIds.has(i.application_id as string))
        .map((i) => ({
          university: universityOf.get(i.application_id as string) ?? "University",
          round: i.round_label as string | null,
          status: i.status as string | null,
          when: interviewTimes(i.confirmed_datetime as string | null, i.timezone as string | null)?.studentTime ?? null,
          date: karachiDate(i.confirmed_datetime as string | null),
          platform: i.platform ? platformLabel(i.platform as string, i.platform_other as string | null) : null,
          addedBy: who(i.created_by),
        })),
      tests,
      today
    )
  );

  // ------------------------------------------------------------ scholarship
  const bodies = new Set((bodyLinks ?? []).map((b) => b.destination_id as string));
  const gate = scholarshipGate(
    (journeyApps ?? [])
      .filter((a) => currentAppIds.has(a.id as string))
      .map((a) => {
        const uni = one(a.university as never) as { destination?: unknown } | null;
        const dest = one(uni?.destination as never) as { id?: string } | null;
        return {
          applicationId: a.id as string,
          destinationId: dest?.id ?? null,
          preenrollmentFinalized: Boolean(a.preenrollment_finalized || a.is_finalized),
          hasBody: Boolean(dest?.id && bodies.has(dest.id)),
          intent: valuesByApp.get(a.id as string)?.scholarship_intent ?? null,
        };
      })
  );
  sections.push(
    scholarshipSection(
      (scholarships ?? [])
        .filter((s) => inCurrent(s.cycle_id as string | null))
        .map((s) => ({
          name: s.name as string,
          university: s.application_id ? (universityOf.get(s.application_id as string) ?? null) : null,
          status: s.status as string,
          documentsStatus: s.documents_status as string | null,
          awardAmount: s.award_amount as number | null,
          deadline: s.application_deadline as string | null,
        })),
      gate.reason,
      today
    )
  );

  // ------------------------------------------------------------ visa & travel
  if (seesVisa) {
    // Only a country with a finalised application has a visa process (visaCountries).
    const finalizedIds = new Set(allApplications.filter((a) => a.finalized).map((a) => a.id));
    const visas: VisaInput[] = outcomes
      .filter((o) => finalizedIds.has(o.applicationId))
      .map((o) => {
        const values = valuesByApp.get(o.applicationId) ?? {};
        const here = defs.filter((d) => d.country_code === o.countryCode);
        const outcomeField = here.find((d) => d.visa_role === "outcome");
        const reasonField = here.find((d) => d.visa_role === "outcome_reason");
        return {
          country: o.country,
          university: o.university || null,
          decision: outcomeField ? readVisaDecision(values[outcomeField.field_key]) : o.decision,
          reason: reasonField ? (values[reasonField.field_key] ?? null) : null,
          appointments: here
            .filter((d) => d.is_appointment)
            .map((d) => ({ label: d.label, date: /^\d{4}-\d{2}-\d{2}$/.test(values[d.field_key] ?? "") ? values[d.field_key] : null })),
        };
      })
      .sort((a, b) => a.country.localeCompare(b.country));
    sections.push(visaSection(visas, today));

    const checked = new Map((travelChecks ?? []).map((c) => [c.item_id as string, c.checked_at as string | null]));
    const travel: TravelInput[] = (guideSections ?? []).flatMap((s) =>
      [...((s.items ?? []) as { id: string; label: string; sort_order: number | null }[])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i) => ({ section: s.title as string, label: i.label, checked: checked.has(i.id), checkedAt: checked.get(i.id) ?? null }))
    );
    sections.push(travelSection(travel, approvedVisas.length > 0));
  }

  // ------------------------------------------------------------ tasks & follow-ups
  const appLabel = new Map(allApplications.map((a) => [a.id, a.programName ? `${a.universityName} · ${a.programName}` : a.universityName]));
  const tasks: TaskInput[] = [
    ...(appTasks ?? [])
      .filter((t) => currentAppIds.has(t.application_id as string))
      .map((t): TaskInput => ({
        kind: "application",
        title: (t.description as string | null) || "Task",
        about: appLabel.get(t.application_id as string) ?? null,
        done: t.status === "done" || t.status === "completed",
        due: t.due_date as string | null,
        owner: who(t.owner_id),
        priority: t.priority as string | null,
      })),
    ...(reminders ?? []).map((r): TaskInput => ({
      kind: "follow_up",
      title: (r.note as string | null)?.trim() || REMINDER_WORDS[r.type as string] || "Reminder",
      about: (r.note as string | null)?.trim() ? (REMINDER_WORDS[r.type as string] ?? null) : null,
      done: Boolean(r.resolved),
      due: r.due_date as string | null,
      owner: who(r.created_by),
      priority: null,
    })),
    ...(personalTasks ?? []).map((t): TaskInput => ({
      kind: "calendar",
      title: (t.title as string | null) || "Task",
      about: null,
      done: t.status === "done",
      due: t.due_date as string | null,
      owner: who(t.owner_id),
      priority: t.priority as string | null,
    })),
  ];
  sections.push(tasksSection(tasks, today));

  // ------------------------------------------------------------ internal remarks
  const remarks: ReportRemark[] = [];
  const leadRemark = one(lead?.remark as never) as { body: string | null; updated_at: string; editor: unknown } | null;
  if (leadRemark?.body?.trim()) {
    const by = (one(leadRemark.editor as never) as { full_name?: string } | null)?.full_name;
    remarks.push({ about: "Student", body: leadRemark.body.trim(), stamp: [by, remarkWhen(leadRemark.updated_at)].filter(Boolean).join(", ") });
  }
  for (const a of [...applications].sort((x, y) => x.number - y.number)) {
    if (!a.remark?.trim()) continue;
    remarks.push({
      about: `#${a.number} ${a.universityName}${a.programName ? ` · ${a.programName}` : ""}`,
      body: a.remark.trim(),
      stamp: [a.remarkBy, a.remarkAt ? remarkWhen(a.remarkAt) : null].filter(Boolean).join(", ") || null,
    });
  }

  // ------------------------------------------------------------ the student
  const team = (row: unknown): TeamLine | null => {
    const p = one(row as never) as { full_name?: string; designation?: string | null; mobile_official?: string | null; email_official?: string | null } | null;
    return p?.full_name ? { name: p.full_name, designation: p.designation ?? null, phone: p.mobile_official ?? null, email: p.email_official ?? null } : null;
  };
  const finalized = allApplications.find((a) => a.finalized && inCurrent(a.cycleId));
  const previousIntakes = cycles.filter((c) => !c.is_current).length;

  return {
    student: {
      name: student.full_name as string,
      code: student.student_code as string | null,
      legacyCodes: (student.legacy_student_codes as string[] | null) ?? [],
      intake: student.intake as string | null,
      service: SERVICE_SHORT[service],
      registration: REGISTRATION_WORDS[(student.registration_status as string | null) ?? "registered"] ?? String(student.registration_status),
      registeredOn: day(lead?.registered_at as string | null) ?? dayOf(lead?.registered_at as string | null),
      email: student.email as string | null,
      phone: student.contact_number as string | null,
      primary: primaryRow?.dest?.display_name ?? (student.country_of_interest as string | null) ?? null,
      backups: destinationList.filter((d) => d.isBackup).map((d) => d.name),
      finalized: finalized ? `${finalized.universityName}${finalized.finalizedBadge ? ` (${finalized.finalizedBadge})` : ""}` : null,
      previousIntakes,
      counsellor: team(student.counsellor),
      officer: team(student.officer),
    },
    sections,
    remarks,
    summary: summariseReport(sections, today),
    withheld: seesVisa ? null : "Visa and travel are left out: they are shown only to Super Admin and Processing.",
    preparedBy: viewer.full_name,
    preparedAt: new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }),
    today,
  };
}
