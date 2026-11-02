// The documents checklist report: every registered student's documents, each
// one approved, waiting for review, missing or sent back — for the Processing
// team and Super Admin, at /reports/documents-checklist and in its PDF and
// Excel downloads. All three are built from what this module returns, so the
// page, the PDF and the workbook cannot disagree about a single document.
//
// "Done" means approved and nothing less. A document the student has uploaded
// is not done until staff have checked it — it is the office's work still to
// do, so it is counted on its own ("awaiting review") rather than as finished.
// Missing and sent back are what the student still owes: "left to do".
//
// Pure: no database here. documentChecklistLoad.ts reads the rows; the unit
// tests drive this directly (scripts/documents-checklist-test.mjs).

// Relative, with their extensions: the unit tests load this under plain Node.
import { CATEGORY_LABELS, sectionOfCategory } from "./documentCategories.ts";
import { MAX_SELECTED_STUDENTS, UUID, param, parseStudentIds, reportFileName, type ReportParams } from "./reportFilters.ts";

export { MAX_SELECTED_STUDENTS };

export type ChecklistState = "approved" | "review" | "missing" | "sent_back";

/** In the order a reader wants them: finished, with staff, owed by the student. */
export const CHECKLIST_STATES: readonly ChecklistState[] = ["approved", "review", "missing", "sent_back"];

export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = {
  approved: "Approved",
  review: "Awaiting review",
  missing: "Missing",
  sent_back: "Sent back",
};

/** The status report's colours (STATUS_COLORS in studentReport.ts): green, amber, red, dark red. */
export const CHECKLIST_STATE_COLORS: Record<ChecklistState, string> = {
  approved: "#16A34A",
  review: "#D97706",
  missing: "#DC2626",
  sent_back: "#7F1D1D",
};

/** A student_documents.status as the report counts it. Anything unknown is owed, never done. */
export function checklistState(status: string | null | undefined): ChecklistState {
  switch (status) {
    case "verified":
      return "approved";
    case "submitted":
    case "under_review":
      return "review";
    case "rejected":
      return "sent_back";
    default:
      return "missing";
  }
}

// ------------------------------------------------------------------ inputs

export type ChecklistStudentInput = {
  id: string;
  name: string;
  code: string | null;
  intake: string | null;
  officerId: string | null;
  /** Destinations the student is pursuing: id for the filter, name to show. */
  countries: { id: string; name: string }[];
};

export type ChecklistDocInput = {
  id: string;
  studentId: string;
  /** As the Documents tab names it, university included for an application's own document. */
  name: string;
  category: string | null;
  status: string;
  uploadedAt: string | null;
  verifiedAt: string | null;
  rejectedReason: string | null;
  /** A date ("2026-11-20"), when staff gave the document one. */
  deadline: string | null;
  /** The intake an approved document was carried over from, if it was. */
  carriedFrom: number | null;
};

export type ChecklistSectionRef = { key: string; label: string };

// ------------------------------------------------------------------ outputs

export type ChecklistCounts = {
  total: number;
  approved: number;
  review: number;
  missing: number;
  sentBack: number;
  /** Missing + sent back: what the student still has to provide. */
  left: number;
};

export type ChecklistDoc = {
  id: string;
  name: string;
  state: ChecklistState;
  uploadedAt: string | null;
  verifiedAt: string | null;
  reason: string | null;
  deadline: string | null;
  /** Past its deadline and not approved. */
  overdue: boolean;
  carriedFrom: number | null;
};

export type ChecklistSectionOut = { key: string; label: string; docs: ChecklistDoc[]; counts: ChecklistCounts };

export type ChecklistStudent = {
  id: string;
  name: string;
  code: string | null;
  intake: string | null;
  officerId: string | null;
  officer: string | null;
  countries: string[];
  counts: ChecklistCounts;
  /** Approved out of all, rounded down so 100 means every one; null with no checklist. */
  percent: number | null;
  sections: ChecklistSectionOut[];
};

export type ChecklistReport = {
  today: string;
  students: ChecklistStudent[];
  totals: ChecklistCounts & {
    students: number;
    /** Students with a checklist and every document on it approved. */
    complete: number;
    /** Students with nothing on their checklist yet. */
    noChecklist: number;
    percent: number | null;
  };
};

// ------------------------------------------------------------------ filters

export type ChecklistShow = "all" | "left" | "complete";
export type ChecklistSort = "name" | "progress";

export type ChecklistFilters = {
  /** "" for everyone, "none" for students with no processing officer, or a staff id. */
  officer: string;
  /** "" for every destination, or a destination id. */
  country: string;
  show: ChecklistShow;
  sort: ChecklistSort;
  /** Particular students (ids), or none for everyone. The other filters still apply to them. */
  students: string[];
};

export const DEFAULT_FILTERS: ChecklistFilters = { officer: "", country: "", show: "all", sort: "name", students: [] };


export const SHOW_LABELS: Record<ChecklistShow, string> = {
  all: "All registered students",
  left: "Students with documents left",
  complete: "Students with every document approved",
};

export const SORT_LABELS: Record<ChecklistSort, string> = {
  name: "Name (A–Z)",
  progress: "Least complete first",
};


/**
 * The filters from a page's or a download's query string. Anything that is
 * not a known value falls back to the default, so a mangled link shows
 * everyone rather than an error or an empty report.
 */
export function parseChecklistFilters(params: ReportParams): ChecklistFilters {
  const officer = param(params, "officer");
  const country = param(params, "country");
  const show = param(params, "show");
  const sort = param(params, "sort");
  return {
    officer: officer === "none" || UUID.test(officer) ? officer : "",
    country: UUID.test(country) ? country : "",
    show: show === "left" || show === "complete" ? show : "all",
    sort: sort === "progress" ? "progress" : "name",
    students: parseStudentIds(params),
  };
}

/** The query string for these filters, leaving out the defaults. Starts with "?" when not empty. */
export function checklistQuery(f: ChecklistFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.officer) q.set("officer", f.officer);
  if (f.country) q.set("country", f.country);
  if (f.show !== "all") q.set("show", f.show);
  if (f.sort !== "name") q.set("sort", f.sort);
  if (f.students.length) q.set("students", f.students.join(","));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * "Officer: Imran Ali · Italy · Students with documents left", or
 * "Student: Ali Raza" / "3 selected students", for the PDF's heading and the
 * workbook.
 */
export function describeFilters(
  f: ChecklistFilters,
  officerName: (id: string) => string | null,
  countryName: (id: string) => string | null,
  studentName: (id: string) => string | null = () => null
): string {
  const parts: string[] = [];
  if (f.students.length === 1) parts.push(`Student: ${studentName(f.students[0]) ?? "one student"}`);
  else if (f.students.length > 1) parts.push(`${f.students.length} selected students`);
  if (f.officer === "none") parts.push("No processing officer");
  else if (f.officer) parts.push(`Officer: ${officerName(f.officer) ?? "unknown"}`);
  if (f.country) parts.push(countryName(f.country) ?? "One destination");
  // "All registered students" beside a chosen few would say the opposite of what was asked.
  if (!(f.students.length && f.show === "all")) parts.push(SHOW_LABELS[f.show]);
  return parts.join(" · ");
}

// ------------------------------------------------------------------ building

export function countDocs(docs: readonly { state: ChecklistState }[]): ChecklistCounts {
  const c: ChecklistCounts = { total: docs.length, approved: 0, review: 0, missing: 0, sentBack: 0, left: 0 };
  for (const d of docs) {
    if (d.state === "approved") c.approved++;
    else if (d.state === "review") c.review++;
    else if (d.state === "missing") c.missing++;
    else c.sentBack++;
  }
  c.left = c.missing + c.sentBack;
  return c;
}

/** Approved as a whole percentage, rounded down: 42 of 43 is 97, never a misleading 100. */
export function percentDone(c: { total: number; approved: number }): number | null {
  return c.total === 0 ? null : Math.floor((c.approved / c.total) * 100);
}

export function isComplete(c: ChecklistCounts): boolean {
  return c.total > 0 && c.approved === c.total;
}

/**
 * Within a section, what is still owed comes first: sent back, then missing,
 * then waiting for review, then approved. The point of the report is what is
 * left, and a list that opens with eight approved rows buries it. Inside each
 * status the Documents tab's own order is kept (the sort is stable).
 */
const STATE_RANK: Record<ChecklistState, number> = { sent_back: 0, missing: 1, review: 2, approved: 3 };

/**
 * One student's documents in the Documents tab's sections, in its order: the
 * sections their destinations carry, each with what is filed under it, empty
 * ones left out, and anything filed under a section they do not carry under
 * "Other" — as DocumentChecklist groups them.
 */
export function groupIntoSections(
  docs: readonly (ChecklistDoc & { category: string | null })[],
  order: readonly ChecklistSectionRef[]
): ChecklistSectionOut[] {
  const known = new Set(order.map((o) => o.key));
  const bySection = new Map<string, ChecklistDoc[]>();
  for (const d of docs) {
    const key = sectionOfCategory(d.category);
    const home = known.has(key) ? key : "other";
    (bySection.get(home) ?? bySection.set(home, []).get(home)!).push(strip(d));
  }
  for (const list of bySection.values()) list.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state]);
  const out: ChecklistSectionOut[] = [];
  for (const s of order) {
    const list = bySection.get(s.key);
    if (list?.length) out.push({ key: s.key, label: s.label, docs: list, counts: countDocs(list) });
  }
  // "Other" is not always in a student's order; never lose its rows for that.
  const other = bySection.get("other");
  if (other?.length && !known.has("other")) {
    out.push({ key: "other", label: CATEGORY_LABELS.other ?? "Other", docs: other, counts: countDocs(other) });
  }
  return out;
}

function strip(d: ChecklistDoc & { category: string | null }): ChecklistDoc {
  const { category: _category, ...doc } = d;
  return doc;
}

export function buildChecklistReport(input: {
  students: readonly ChecklistStudentInput[];
  /** Each student's current-intake documents, in the Documents tab's order. */
  docs: readonly ChecklistDocInput[];
  sectionsByStudent: ReadonlyMap<string, readonly ChecklistSectionRef[]>;
  officerNames: ReadonlyMap<string, string>;
  filters: ChecklistFilters;
  /** The office's day, "2026-11-02". */
  today: string;
}): ChecklistReport {
  const { filters, today } = input;
  const docsByStudent = new Map<string, ChecklistDocInput[]>();
  for (const d of input.docs) (docsByStudent.get(d.studentId) ?? docsByStudent.set(d.studentId, []).get(d.studentId)!).push(d);

  const all: ChecklistStudent[] = input.students.map((s) => {
    const docs = (docsByStudent.get(s.id) ?? []).map((d) => {
      const state = checklistState(d.status);
      const deadline = /^\d{4}-\d{2}-\d{2}/.test(d.deadline ?? "") ? d.deadline!.slice(0, 10) : null;
      return {
        id: d.id,
        name: d.name.trim() || "Document",
        category: d.category,
        state,
        uploadedAt: d.uploadedAt,
        verifiedAt: d.verifiedAt,
        reason: state === "sent_back" ? d.rejectedReason?.trim() || null : null,
        deadline,
        overdue: Boolean(deadline && deadline < today && state !== "approved"),
        carriedFrom: d.carriedFrom,
      };
    });
    const counts = countDocs(docs);
    return {
      id: s.id,
      name: s.name.trim() || "Unnamed student",
      code: s.code,
      intake: s.intake,
      officerId: s.officerId,
      officer: s.officerId ? input.officerNames.get(s.officerId) ?? null : null,
      countries: s.countries.map((c) => c.name),
      counts,
      percent: percentDone(counts),
      sections: groupIntoSections(docs, input.sectionsByStudent.get(s.id) ?? []),
    };
  });

  const countryOf = new Map(input.students.map((s) => [s.id, new Set(s.countries.map((c) => c.id))]));
  const chosen = new Set(filters.students);
  const students = all.filter((s) => {
    if (chosen.size && !chosen.has(s.id.toLowerCase())) return false;
    if (filters.officer === "none" ? s.officerId !== null : filters.officer && s.officerId !== filters.officer) return false;
    if (filters.country && !countryOf.get(s.id)?.has(filters.country)) return false;
    if (filters.show === "left" && isComplete(s.counts)) return false;
    if (filters.show === "complete" && !isComplete(s.counts)) return false;
    return true;
  });

  const byName = (a: ChecklistStudent, b: ChecklistStudent) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.code ?? "").localeCompare(b.code ?? "");
  students.sort(
    filters.sort === "progress"
      ? // No checklist at all is the least complete of all; then the lowest share approved.
        (a, b) => (a.percent ?? -1) - (b.percent ?? -1) || b.counts.left - a.counts.left || byName(a, b)
      : byName
  );

  const totals = students.reduce(
    (t, s) => {
      t.total += s.counts.total;
      t.approved += s.counts.approved;
      t.review += s.counts.review;
      t.missing += s.counts.missing;
      t.sentBack += s.counts.sentBack;
      t.left += s.counts.left;
      if (isComplete(s.counts)) t.complete++;
      if (s.counts.total === 0) t.noChecklist++;
      return t;
    },
    { students: students.length, total: 0, approved: 0, review: 0, missing: 0, sentBack: 0, left: 0, complete: 0, noChecklist: 0 }
  );

  return { today, students, totals: { ...totals, percent: percentDone(totals) } };
}

/**
 * "HMC-Documents-Checklist-2026-11-02.pdf" — ".xlsx" for the workbook — or,
 * for one student, "HMC-Documents-Checklist-Ali-Raza-HMC-FALL27-IT-0003-2026-11-02.pdf",
 * so a file saved for a student says whose it is.
 */
export function checklistFileName(today: string, ext: "pdf" | "xlsx", only?: { name: string; code: string | null } | null): string {
  return reportFileName("Documents-Checklist", today, ext, only);
}
