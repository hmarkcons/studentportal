// The applications table (staff): its columns, the order a Super Admin
// arranges them in, and how a stage reads — its colour, how far along it is,
// and whether the application has an offer, is still being worked, or has
// ended. Pure — scripts/application-table-test.mjs.
//
// The student's portal is untouched by any of this; it keeps its own design.

import { categorizeApplicationStage } from "./applicationStage.ts";
import { applicationStageLabel, isFinalizedStage } from "./finalizedStage.ts";

// ---------------------------------------------------------------- columns

export type ApplicationColumnKey =
  | "student"
  | "student_code"
  | "priority"
  | "country"
  | "university"
  | "city"
  | "program"
  | "level"
  | "intake"
  | "round"
  | "deadline"
  | "stage"
  | "fee"
  | "requirements"
  | "finalized"
  | "remark"
  | "tasks"
  | "counselor"
  | "officer"
  | "portal_link"
  | "page_link"
  | "requirements_link"
  | "coordinator_email"
  | "university_email"
  | "updated";

/**
 * Every column, in the order they start in. `scope` keeps the student's own
 * columns off the student's tab, where every row is theirs, and the priority
 * arrows off the all-applications page, where order is set per student.
 */
export const APPLICATION_COLUMNS: { key: ApplicationColumnKey; header: string; scope?: "all" | "student" }[] = [
  { key: "student", header: "Student", scope: "all" },
  { key: "student_code", header: "Student ID", scope: "all" },
  { key: "priority", header: "Priority", scope: "student" },
  { key: "country", header: "Country" },
  { key: "university", header: "University" },
  { key: "city", header: "City" },
  { key: "program", header: "Programme" },
  { key: "level", header: "Level" },
  { key: "intake", header: "Intake" },
  { key: "round", header: "Round" },
  { key: "deadline", header: "Deadline" },
  { key: "stage", header: "Stage" },
  { key: "fee", header: "Application fee" },
  { key: "requirements", header: "Special requirements" },
  { key: "finalized", header: "Finalized" },
  { key: "remark", header: "Remark" },
  { key: "tasks", header: "Tasks" },
  { key: "counselor", header: "Counsellor", scope: "all" },
  { key: "officer", header: "Processing", scope: "all" },
  { key: "portal_link", header: "Application portal" },
  { key: "page_link", header: "Programme page" },
  { key: "requirements_link", header: "Requirements page" },
  { key: "coordinator_email", header: "Coordinator email" },
  { key: "university_email", header: "University email" },
  { key: "updated", header: "Last updated" },
];

const KEYS = new Set<string>(APPLICATION_COLUMNS.map((c) => c.key));

/** A saved order, kept to the columns that exist: unknown names dropped, each once. */
export function readApplicationColumnOrder(saved: unknown): ApplicationColumnKey[] | null {
  if (!Array.isArray(saved)) return null;
  const seen = new Set<string>();
  const out: ApplicationColumnKey[] = [];
  for (const k of saved) {
    if (typeof k === "string" && KEYS.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as ApplicationColumnKey);
    }
  }
  return out.length ? out : null;
}

/**
 * The columns in the arranged order: those the order names, as it names them,
 * then any it does not (a column added since it was saved), in their default
 * place — and only those that belong on this screen. Every column, with no
 * screen named: what the arranging dialog lists.
 */
export function orderedApplicationColumns(saved: unknown, scope?: "all" | "student") {
  const order = readApplicationColumnOrder(saved) ?? [];
  const rank = new Map(order.map((k, i) => [k, i]));
  return APPLICATION_COLUMNS.map((c, i) => ({ c, at: rank.has(c.key) ? rank.get(c.key)! : order.length + i }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.c)
    .filter((c) => !scope || !c.scope || c.scope === scope);
}

// ------------------------------------------------------------------ stages

/** Closing results any application can be given, whatever its country's stages (0080). */
export const MANUAL_STAGES = ["rejected", "declined", "withdrawn"] as const;
const MANUAL_LABELS: Record<string, string> = { rejected: "Rejected", declined: "Not eligible", withdrawn: "Withdrawn" };

export function stageLabel(stage: string): string {
  return MANUAL_LABELS[stage] ?? applicationStageLabel(stage);
}

/**
 * What the stage dropdown offers: the country's stages, then the closing
 * results. Pre-Enrolled / University Finalized is reached by finalising the
 * university (0301), so it is offered only while the application stands on it.
 */
export function stageOptions(pipeline: readonly string[], current?: string): { key: string; label: string }[] {
  const keys = [...pipeline.filter((s) => !isFinalizedStage(s) || s === current), ...MANUAL_STAGES.filter((m) => !pipeline.includes(m))];
  return keys.map((key) => ({ key, label: stageLabel(key) }));
}

/** A stage that is an offer, or comes after one: what "accepted" means here. */
const OFFER = /offer|acceptance|loa|admission_letter|pre_enrolled|university_finalized|enrolled|cas_|coe|i20|visa/;

/**
 * Where an application stands, for its place in the list: accepted (an offer
 * or anything after it) at the top, still being worked in the middle, and
 * withdrawn or not eligible, then rejected, at the bottom.
 */
export type StageGroup = "accepted" | "progress" | "closed" | "rejected";

export function stageGroup(stage: string, pipeline: readonly string[]): StageGroup {
  if (stage === "rejected") return "rejected";
  if (stage === "withdrawn" || stage === "declined") return "closed";
  if (categorizeApplicationStage(stage, [...pipeline]) === "with_offer") return "accepted";
  // A country with no Under Review: the first offer-like stage starts it.
  const firstOffer = pipeline.findIndex((s) => OFFER.test(s));
  const at = pipeline.indexOf(stage);
  if (firstOffer !== -1 && at >= firstOffer) return "accepted";
  return "progress";
}

export const GROUP_RANK: Record<StageGroup, number> = { accepted: 0, progress: 1, closed: 2, rejected: 3 };
export const GROUP_LABEL: Record<StageGroup, string> = {
  accepted: "Offer or later",
  progress: "In progress",
  closed: "Withdrawn / not eligible",
  rejected: "Rejected",
};

/** The colours a stage can be shown in (globals.css, [data-hue]). */
export type StageHue =
  | "amber"
  | "lime"
  | "sky"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "teal"
  | "green"
  | "emerald"
  | "orange"
  | "cyan"
  | "blue"
  | "red"
  | "slate";

/** A colour for every stage, by what kind of step it is, so the list reads at a glance. */
export function stageHue(stage: string): StageHue {
  const s = stage.toLowerCase();
  if (s === "rejected") return "red";
  if (s === "withdrawn" || s === "declined") return "slate";
  if (s === "enrolled" || s === "visa_granted") return "emerald";
  if (s === "pre_enrolled" || s === "university_finalized") return "teal";
  if (s.startsWith("visa")) return "blue";
  if (/^(coe|cas|i20|invitation|loa)/.test(s)) return "cyan";
  if (/tuition|pay/.test(s)) return "orange";
  if (/unconditional|acceptance|offer_accepted/.test(s)) return "green";
  if (/offer/.test(s)) return "lime";
  if (/interview|credibility/.test(s)) return "fuchsia";
  if (/legalization|gs_/.test(s)) return "violet";
  if (/review/.test(s)) return "indigo";
  if (/submitted/.test(s)) return "sky";
  if (/verified/.test(s)) return "lime";
  return "amber";
}

/** How far along its country's stages an application is: step 3 of 11. Null for a closing result. */
export function stageProgress(stage: string, pipeline: readonly string[]): { step: number; of: number } | null {
  const at = pipeline.indexOf(stage);
  if (at === -1) return null;
  return { step: at + 1, of: pipeline.length };
}

// ---------------------------------------------------------------- ordering

export type Sortable = { stage: string; pipeline: readonly string[]; studentName: string; sortOrder: number | null; createdAt: string };

/**
 * The list's order: offers first, rejections last (the office's rule); then by
 * student, keeping each student's applications together; then the priority
 * staff gave them, then the order they were made in.
 */
export function compareApplications(a: Sortable, b: Sortable): number {
  return (
    GROUP_RANK[stageGroup(a.stage, a.pipeline)] - GROUP_RANK[stageGroup(b.stage, b.pipeline)] ||
    a.studentName.localeCompare(b.studentName) ||
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}
