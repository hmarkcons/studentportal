// The processing officer's dashboard, and the processing team's: admissions,
// documents, visas and scholarships for registered students. Pure —
// scripts/dashboards-test.mjs.

import { categorizeApplicationStage, type ApplicationStageCategory } from "../applicationStage.ts";
import type { ReportMonth } from "../leadOwners.ts";
import { percentOf } from "../chartMath.ts";
import type { DashboardStageDef, DashboardStageValues } from "../dashboardPipeline.ts";
import { stageSnapshot } from "../stageProgress.ts";
import { addDays, daysBetween, karachiDay, karachiMonth } from "./dates.ts";

/** How far ahead an application deadline is worth listing — the staff queue's fortnight. */
export const DEADLINE_WINDOW_DAYS = 14;
export const SCHOLARSHIP_WINDOW_DAYS = 30;
/** Document turnaround and visa rates are measured over this many days. */
export const TURNAROUND_DAYS = 90;
export const VISA_RATE_DAYS = 365;

export const OUTCOME_LABELS: Record<ApplicationStageCategory, string> = {
  pending: "Preparing",
  submitted: "Submitted",
  with_offer: "Offer received",
  rejected: "Rejected",
  not_eligible: "Not eligible",
  withdrawn: "Withdrawn",
};

export type ProcStudent = { id: string; full_name: string | null; processing_officer_id: string | null };
export type ProcApplication = {
  id: string;
  student_id: string;
  current_stage: string | null;
  pipelineStages: string[];
  /** Already resolved with applicationDeadline(). */
  deadline: string | null;
  universityName: string;
};
export type ProcDocument = { id: string; student_id: string; status: string; uploaded_at: string | null; verified_at: string | null };
export type ProcVisa = { studentId: string | null; decision: "approved" | "refused" | "pending"; decidedAt: string | null };
export type ProcScholarship = { student_id: string; status: string | null; application_deadline: string | null; name: string | null };
export type ProcStages = { studentId: string; destinationName: string; stages: DashboardStageDef[]; values: DashboardStageValues };

export type ProcessingSummary = {
  students: number;
  outcomes: { category: ApplicationStageCategory; label: string; count: number }[];
  deadlines: { studentId: string; studentName: string; university: string; due: string; days: number }[];
  docsWaiting: number;
  oldestWaiting: { studentId: string; studentName: string; days: number }[];
  /** Average whole days from upload to approval, over the documents approved in the last TURNAROUND_DAYS. */
  turnaroundDays: number | null;
  reviewedMonthly: { key: string; label: string; count: number }[];
  visaMonthly: { key: string; label: string; approved: number; refused: number }[];
  visaYear: { approved: number; refused: number; rate: number | null };
  scholarships: { label: string; count: number }[];
  scholarshipDeadlines: { studentId: string; studentName: string; name: string; due: string; days: number }[];
  /** Students by the country stage they are on now, busiest first. */
  stageMix: { label: string; count: number }[];
  /** Stuck on a refusal, a failure or a wait (isNegativeValue). */
  blocked: { studentId: string; studentName: string; destination: string; latest: string }[];
  completeCount: number;
};

export function summarizeProcessing({
  students,
  applications,
  documents,
  visas,
  scholarships,
  stages,
  months,
  today,
}: {
  students: ProcStudent[];
  applications: ProcApplication[];
  documents: ProcDocument[];
  visas: ProcVisa[];
  scholarships: ProcScholarship[];
  stages: ProcStages[];
  months: ReportMonth[];
  today: string;
}): ProcessingSummary {
  const ids = new Set(students.map((s) => s.id));
  const nameOf = new Map(students.map((s) => [s.id, s.full_name ?? "Student"]));
  const mine = <T>(rows: T[], key: (r: T) => string | null) => rows.filter((r) => ids.has(key(r) ?? ""));

  // ---- applications
  const outcomeCounts = new Map<ApplicationStageCategory, number>();
  const deadlines: ProcessingSummary["deadlines"] = [];
  const horizon = addDays(today, DEADLINE_WINDOW_DAYS);
  for (const a of mine(applications, (a) => a.student_id)) {
    const cat = categorizeApplicationStage(a.current_stage ?? "", a.pipelineStages);
    outcomeCounts.set(cat, (outcomeCounts.get(cat) ?? 0) + 1);
    // Only an application still being prepared has a deadline to meet.
    if (cat === "pending" && a.deadline && a.deadline >= today && a.deadline <= horizon) {
      deadlines.push({ studentId: a.student_id, studentName: nameOf.get(a.student_id) ?? "Student", university: a.universityName, due: a.deadline, days: daysBetween(today, a.deadline) });
    }
  }
  deadlines.sort((a, b) => a.due.localeCompare(b.due) || a.studentName.localeCompare(b.studentName));

  // ---- documents
  const waiting = mine(documents, (d) => d.student_id).filter((d) => d.status === "submitted" || d.status === "under_review");
  const oldestByStudent = new Map<string, number>();
  for (const d of waiting) {
    const days = d.uploaded_at ? daysBetween(karachiDay(d.uploaded_at), today) : 0;
    oldestByStudent.set(d.student_id, Math.max(oldestByStudent.get(d.student_id) ?? 0, days));
  }
  const oldestWaiting = [...oldestByStudent.entries()]
    .map(([studentId, days]) => ({ studentId, studentName: nameOf.get(studentId) ?? "Student", days }))
    .sort((a, b) => b.days - a.days || a.studentName.localeCompare(b.studentName))
    .slice(0, 6);

  const turnaroundSince = addDays(today, -TURNAROUND_DAYS);
  const turnarounds: number[] = [];
  const reviewedMonthly = months.map((m) => ({ key: m.key, label: m.label, count: 0 }));
  const reviewedBucket = new Map(reviewedMonthly.map((m) => [m.key, m]));
  for (const d of mine(documents, (d) => d.student_id)) {
    if (d.status !== "verified" || !d.verified_at) continue;
    const bucket = reviewedBucket.get(karachiMonth(d.verified_at));
    if (bucket) bucket.count++;
    const verifiedDay = karachiDay(d.verified_at);
    if (d.uploaded_at && verifiedDay >= turnaroundSince) turnarounds.push(Math.max(0, daysBetween(karachiDay(d.uploaded_at), verifiedDay)));
  }

  // ---- visas
  const visaMonthly = months.map((m) => ({ key: m.key, label: m.label, approved: 0, refused: 0 }));
  const visaBucket = new Map(visaMonthly.map((m) => [m.key, m]));
  const yearSince = addDays(today, -VISA_RATE_DAYS);
  let approved = 0;
  let refused = 0;
  for (const v of mine(visas, (v) => v.studentId)) {
    if (v.decision === "pending" || !v.decidedAt) continue;
    const bucket = visaBucket.get(karachiMonth(v.decidedAt));
    if (bucket) bucket[v.decision]++;
    if (karachiDay(v.decidedAt) >= yearSince) {
      if (v.decision === "approved") approved++;
      else refused++;
    }
  }

  // ---- scholarships
  const scholarshipCounts = new Map<string, number>();
  const scholarshipDeadlines: ProcessingSummary["scholarshipDeadlines"] = [];
  const scholarshipHorizon = addDays(today, SCHOLARSHIP_WINDOW_DAYS);
  for (const s of mine(scholarships, (s) => s.student_id)) {
    const status = s.status ?? "pending";
    scholarshipCounts.set(status, (scholarshipCounts.get(status) ?? 0) + 1);
    const due = (s.application_deadline ?? "").slice(0, 10);
    if (due && due >= today && due <= scholarshipHorizon && status !== "accepted" && status !== "rejected") {
      scholarshipDeadlines.push({ studentId: s.student_id, studentName: nameOf.get(s.student_id) ?? "Student", name: s.name ?? "Scholarship", due, days: daysBetween(today, due) });
    }
  }
  scholarshipDeadlines.sort((a, b) => a.due.localeCompare(b.due));

  // ---- country stages
  const stageCounts = new Map<string, number>();
  const blocked: ProcessingSummary["blocked"] = [];
  let completeCount = 0;
  for (const row of mine(stages, (r) => r.studentId)) {
    const snap = stageSnapshot(row.stages, row.values);
    if (snap.complete) {
      completeCount++;
      continue;
    }
    stageCounts.set(snap.currentLabel, (stageCounts.get(snap.currentLabel) ?? 0) + 1);
    if (snap.blocked && snap.latest) blocked.push({ studentId: row.studentId, studentName: nameOf.get(row.studentId) ?? "Student", destination: row.destinationName, latest: snap.latest });
  }

  return {
    students: students.length,
    outcomes: (Object.keys(OUTCOME_LABELS) as ApplicationStageCategory[])
      .map((category) => ({ category, label: OUTCOME_LABELS[category], count: outcomeCounts.get(category) ?? 0 }))
      .filter((o) => o.count > 0),
    deadlines,
    docsWaiting: waiting.length,
    oldestWaiting,
    turnaroundDays: turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : null,
    reviewedMonthly,
    visaMonthly,
    visaYear: { approved, refused, rate: percentOf(approved, approved + refused) },
    scholarships: [...scholarshipCounts.entries()].map(([label, count]) => ({ label: SCHOLARSHIP_LABELS[label] ?? label, count })).sort((a, b) => b.count - a.count),
    scholarshipDeadlines: scholarshipDeadlines.slice(0, 6),
    stageMix: [...stageCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8),
    blocked: blocked.slice(0, 6),
    completeCount,
  };
}

const SCHOLARSHIP_LABELS: Record<string, string> = {
  submitted: "Submitted",
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  modification: "Needs changes",
};

export type OfficerRow = {
  id: string;
  name: string;
  students: number;
  docsWaiting: number;
  visaApproved: number;
  visaRefused: number;
  rate: number | null;
};

/**
 * The processing team, officer by officer: how many students each carries,
 * documents waiting on them, and their visa results over the last year.
 * Students with no officer are grouped under "Unassigned", because an
 * unassigned student is work nobody in particular is watching.
 */
export function officerTable({
  officers,
  students,
  documents,
  visas,
  today,
}: {
  officers: { id: string; full_name: string }[];
  students: ProcStudent[];
  documents: ProcDocument[];
  visas: ProcVisa[];
  today: string;
}): OfficerRow[] {
  const officerOf = new Map(students.map((s) => [s.id, s.processing_officer_id ?? "unassigned"]));
  const rows = new Map<string, OfficerRow>([
    ...officers.map((o) => [o.id, { id: o.id, name: o.full_name, students: 0, docsWaiting: 0, visaApproved: 0, visaRefused: 0, rate: null }] as const),
    ["unassigned", { id: "unassigned", name: "Unassigned", students: 0, docsWaiting: 0, visaApproved: 0, visaRefused: 0, rate: null }],
  ]);
  const row = (studentId: string | null) => rows.get(officerOf.get(studentId ?? "") ?? "") ?? null;
  for (const s of students) {
    const r = rows.get(s.processing_officer_id ?? "unassigned") ?? rows.get("unassigned")!;
    r.students++;
  }
  for (const d of documents) {
    if (d.status === "submitted" || d.status === "under_review") {
      const r = row(d.student_id);
      if (r) r.docsWaiting++;
    }
  }
  const since = addDays(today, -VISA_RATE_DAYS);
  for (const v of visas) {
    if (v.decision === "pending" || !v.decidedAt || karachiDay(v.decidedAt) < since) continue;
    const r = row(v.studentId);
    if (!r) continue;
    if (v.decision === "approved") r.visaApproved++;
    else r.visaRefused++;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, rate: percentOf(r.visaApproved, r.visaApproved + r.visaRefused) }))
    .filter((r) => r.id !== "unassigned" || r.students > 0)
    .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name));
}
