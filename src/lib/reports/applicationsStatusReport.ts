// The applications report (2026-11-18): registered students' applications —
// one student or every one — by where each stands:
//
//   Submitted     at or past Application Submitted: under review, an offer, a
//                 letter or a visa stage count (as on the student's list, where
//                 submitted come first), a rejection or withdrawal does not
//   Pending       not yet submitted (documents pending or verified)
//   Rejected      rejected by the university
//   Not eligible  set to Not eligible
//
// Withdrawn applications are in "All applications" only. The category is
// categorizeApplicationStage's, which the reports and the dashboard share.
//
// Pure — no portal imports — so the unit tests load it under plain Node.
import { categorizeApplicationStage } from "../applicationStage.ts";
import { stageLabel } from "../applicationTable.ts";
import { day } from "../studentReport.ts";
import type { TableReport, TableRow } from "./tableReport.ts";

export type AppCategory = "submitted" | "pending" | "rejected" | "not_eligible" | "withdrawn";
export type AppFilter = "all" | "submitted" | "pending" | "rejected" | "not_eligible";

export const APP_FILTER_LABELS: Record<AppFilter, string> = {
  all: "All applications",
  submitted: "Applications submitted",
  pending: "Applications pending",
  rejected: "Applications rejected",
  not_eligible: "Applications not eligible",
};
const CATEGORY_LABELS: Record<AppCategory, string> = {
  submitted: "Submitted",
  pending: "Pending",
  rejected: "Rejected",
  not_eligible: "Not eligible",
  withdrawn: "Withdrawn",
};

export type AppReportFilters = { student: string; category: AppFilter };

/** A registered student as the Student dropdown names them. */
export const studentOption = (s: { id: string; name: string; code: string | null }) => ({ value: s.id, label: s.code ? `${s.name} · ${s.code}` : s.name });

/** The Applications dropdown's choices; "" is All. */
export const appCategoryOptions = () => (Object.keys(APP_FILTER_LABELS) as AppFilter[]).map((k) => ({ value: k === "all" ? "" : k, label: APP_FILTER_LABELS[k] }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAppFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): AppReportFilters {
  const get = (k: string) => {
    const raw = params instanceof URLSearchParams ? params.get(k) : params[k];
    return ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
  };
  const student = get("student");
  const category = get("category");
  return {
    student: UUID.test(student) ? student.toLowerCase() : "",
    category: category in APP_FILTER_LABELS ? (category as AppFilter) : "all",
  };
}

/** Where an application stands, in the report's terms. */
export function appCategory(stage: string, pipeline: readonly string[]): AppCategory {
  const c = categorizeApplicationStage(stage, [...pipeline]);
  return c === "with_offer" ? "submitted" : c;
}

export type AppReportInput = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  universityName: string;
  programName: string | null;
  level: string | null;
  country: string | null;
  intake: string | null;
  roundLabel: string | null;
  deadline: string | null;
  stage: string;
  pipeline: string[];
  createdAt: string;
  /** When it was first submitted, from its stage history. */
  submittedAt: string | null;
};

const TONE = { submitted: "good", pending: "warn", rejected: "bad", not_eligible: "bad", withdrawn: "muted" } as const;

export function buildAppReport(
  all: readonly AppReportInput[],
  filters: AppReportFilters,
  meta: { preparedOn: string; preparedBy: string | null; studentLabel: string | null }
): TableReport {
  const scope = all.filter((a) => !filters.student || a.studentId.toLowerCase() === filters.student);
  const withCategory = scope.map((a) => ({ a, category: appCategory(a.stage, a.pipeline) }));
  const shown = withCategory
    .filter((x) => filters.category === "all" || x.category === filters.category)
    .sort(
      (x, y) =>
        x.a.studentName.localeCompare(y.a.studentName, "en", { sensitivity: "base" }) ||
        x.a.studentId.localeCompare(y.a.studentId) ||
        // The submitted first, in the order they were submitted; then the rest as they were made.
        (x.category === "submitted" ? 0 : 1) - (y.category === "submitted" ? 0 : 1) ||
        (x.a.submittedAt ?? x.a.createdAt).localeCompare(y.a.submittedAt ?? y.a.createdAt)
    );
  const count = (c: AppCategory) => withCategory.filter((x) => x.category === c).length;

  const rows: TableRow[] = shown.map(({ a, category }) => ({
    group: `${a.studentName}${a.studentCode ? ` · ${a.studentCode}` : ""}`,
    tone: TONE[category],
    cells: {
      university: a.universityName,
      programme: a.programName ?? "—",
      level: a.level ?? "—",
      country: a.country ?? "—",
      intake: a.intake ?? "—",
      round: a.roundLabel ?? "—",
      stage: stageLabel(a.stage),
      category: CATEGORY_LABELS[category],
      submitted: category === "submitted" ? (day(a.submittedAt) ?? "—") : "—",
      deadline: day(a.deadline) ?? "—",
    },
  }));

  return {
    title: "Applications report",
    filters: [meta.studentLabel ?? "All registered students", APP_FILTER_LABELS[filters.category]].join(" · "),
    preparedOn: meta.preparedOn,
    preparedBy: meta.preparedBy,
    summary: [
      { label: "Applications shown", value: String(shown.length) },
      { label: "Submitted", value: String(count("submitted")), tone: "good" },
      { label: "Pending", value: String(count("pending")), tone: "warn" },
      { label: "Rejected", value: String(count("rejected")), tone: "bad" },
      { label: "Not eligible", value: String(count("not_eligible")), tone: "bad" },
      ...(count("withdrawn") ? [{ label: "Withdrawn", value: String(count("withdrawn")), tone: "muted" as const }] : []),
    ],
    columns: [
      { key: "university", header: "University", width: 1.8 },
      { key: "programme", header: "Programme", width: 2.2 },
      { key: "level", header: "Level", width: 0.8 },
      { key: "country", header: "Country", width: 1.1 },
      { key: "intake", header: "Intake", width: 0.9 },
      { key: "round", header: "Round", width: 0.8 },
      { key: "stage", header: "Stage", width: 1.2 },
      { key: "category", header: "Status", width: 0.9 },
      { key: "submitted", header: "Submitted on", width: 1 },
      { key: "deadline", header: "Deadline", width: 1 },
    ],
    rows,
    empty: `No ${APP_FILTER_LABELS[filters.category].toLowerCase()}${meta.studentLabel ? ` for ${meta.studentLabel}` : ""}.`,
    note: "Submitted: at or past Application Submitted — under review, an offer, a letter or a visa stage included. Pending: not yet submitted. Rejected: rejected by the university. Not eligible: set to Not eligible. Withdrawn applications appear under All applications only.",
  };
}
