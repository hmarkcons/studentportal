// The documents checklist report as a workbook: three sheets, built from the
// same ChecklistReport the page and the PDF draw.
//
//   Summary     one row per student: how many documents, how many approved,
//               waiting for review and left, and the share approved
//   Checklist   one row per document, every student's, with its status —
//               the sheet to filter by student, section or status
//   Still to do the Checklist's rows that are not approved, and nothing else
//
// Pure: the route hands these sheets to write-excel-file.

import {
  CHECKLIST_STATE_LABELS,
  isComplete,
  type ChecklistDoc,
  type ChecklistReport,
  type ChecklistState,
  type ChecklistStudent,
} from "./documentChecklistReport.ts";

export type CellStyle = {
  /** "Consolas" for a password, so 0/O and 1/l/I cannot be mistaken. */
  fontFamily?: string;
  fontWeight?: "bold";
  fontStyle?: "italic";
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
  alignVertical?: "top" | "center" | "bottom";
  wrap?: boolean;
  borderColor?: string;
  borderStyle?: "thin";
};

export type WorkbookCell =
  | ({ type: StringConstructor; value?: string } & CellStyle)
  | ({ type: NumberConstructor; value?: number; format?: string } & CellStyle)
  | ({ type: DateConstructor; value?: Date; format?: string } & CellStyle)
  | null;

export type WorkbookSheet = {
  sheet: string;
  data: WorkbookCell[][];
  columns: { width: number }[];
  stickyRowsCount?: number;
  stickyColumnsCount?: number;
};

const HEADER: CellStyle = { fontWeight: "bold", backgroundColor: "#E6F4EE", borderColor: "#B7DCC8", borderStyle: "thin", alignVertical: "center", wrap: true };

/** A pale fill and a dark text for each status, readable printed in black and white too. */
const STATE_STYLE: Record<ChecklistState, CellStyle> = {
  approved: { backgroundColor: "#DCFCE7", textColor: "#166534" },
  review: { backgroundColor: "#FEF3C7", textColor: "#92400E" },
  missing: { backgroundColor: "#FEE2E2", textColor: "#991B1B" },
  sent_back: { backgroundColor: "#FCA5A5", textColor: "#7F1D1D", fontWeight: "bold" },
};

const DATE_FORMAT = "dd mmm yyyy";

const text = (value: string | null | undefined, style: CellStyle = {}): WorkbookCell => ({ type: String, value: value || undefined, ...style });
const num = (value: number, style: CellStyle = {}, format?: string): WorkbookCell => ({ type: Number, value, ...(format ? { format } : {}), ...style });

/** A date column as a real date, so Excel sorts and filters it as one. */
function dateCell(value: string | null, kind: "day" | "moment", style: CellStyle = {}): WorkbookCell {
  if (!value) return text(null, style);
  let day: string | null = null;
  if (kind === "day") day = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  else {
    const at = new Date(value);
    // The office's calendar: uploaded at 1 a.m. in Karachi is that day, not the UTC day before.
    if (!Number.isNaN(at.getTime())) day = at.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  }
  if (!day) return text(value, style);
  return { type: Date, value: new Date(`${day}T00:00:00Z`), format: DATE_FORMAT, ...style };
}

function noteFor(d: ChecklistDoc): string | null {
  const parts: string[] = [];
  if (d.state === "sent_back") parts.push(d.reason ? `Sent back: ${d.reason}` : "Sent back");
  if (d.overdue) parts.push("Past its deadline");
  if (d.carriedFrom) parts.push(`Carried over from intake ${d.carriedFrom}`);
  return parts.length ? parts.join(" · ") : null;
}

function summarySheet(report: ChecklistReport, meta: WorkbookMeta): WorkbookSheet {
  const t = report.totals;
  const title: WorkbookCell[][] = [
    [text("HMARK Consultants — Documents checklist", { fontWeight: "bold", fontSize: 14 })],
    [text(`Prepared ${meta.preparedOn}${meta.preparedBy ? ` by ${meta.preparedBy}` : ""} · ${meta.filters}`, { fontStyle: "italic", textColor: "#4B5563" })],
    [
      text(
        `${t.students} student${t.students === 1 ? "" : "s"} · ${t.total} documents · ${t.approved} approved (${t.percent ?? 0}%) · ${t.review} awaiting review · ${t.left} left to do (${t.missing} missing, ${t.sentBack} sent back)`,
        { fontWeight: "bold" }
      ),
    ],
    [],
  ];
  const header = [
    "#",
    "Student",
    "Student ID",
    "Destination",
    "Intake",
    "Processing officer",
    "Documents",
    "Approved",
    "Awaiting review",
    "Missing",
    "Sent back",
    "Left to do",
    "% approved",
  ].map((h) => text(h, HEADER));

  const rows = report.students.map((s, i): WorkbookCell[] => {
    const tint: CellStyle = isComplete(s.counts) ? { backgroundColor: "#F0FDF4" } : {};
    return [
      num(i + 1, tint),
      text(s.name, { ...tint, fontWeight: "bold" }),
      text(s.code ?? "No Student ID yet", { ...tint, ...(s.code ? {} : { fontStyle: "italic", textColor: "#6B7280" }) }),
      text(s.countries.join(", ") || "—", tint),
      text(s.intake, tint),
      text(s.officer ?? "Not assigned", { ...tint, ...(s.officer ? {} : { fontStyle: "italic", textColor: "#6B7280" }) }),
      num(s.counts.total, tint),
      num(s.counts.approved, { ...tint, textColor: "#166534" }),
      num(s.counts.review, { ...tint, ...(s.counts.review ? { textColor: "#92400E" } : {}) }),
      num(s.counts.missing, { ...tint, ...(s.counts.missing ? { textColor: "#991B1B" } : {}) }),
      num(s.counts.sentBack, { ...tint, ...(s.counts.sentBack ? { textColor: "#7F1D1D", fontWeight: "bold" } : {}) }),
      num(s.counts.left, { ...tint, fontWeight: "bold", ...(s.counts.left ? { textColor: "#991B1B" } : {}) }),
      s.percent === null ? text("No checklist", { ...tint, fontStyle: "italic" }) : num(s.percent / 100, tint, "0%"),
    ];
  });

  const totalStyle: CellStyle = { fontWeight: "bold", backgroundColor: "#F3F4F6", borderColor: "#D1D5DB", borderStyle: "thin" };
  const totals: WorkbookCell[] = [
    text(null, totalStyle),
    text("Total", totalStyle),
    text(null, totalStyle),
    text(null, totalStyle),
    text(null, totalStyle),
    text(null, totalStyle),
    num(t.total, totalStyle),
    num(t.approved, totalStyle),
    num(t.review, totalStyle),
    num(t.missing, totalStyle),
    num(t.sentBack, totalStyle),
    num(t.left, totalStyle),
    t.percent === null ? text(null, totalStyle) : num(t.percent / 100, totalStyle, "0%"),
  ];

  return {
    sheet: "Summary",
    data: [...title, header, ...rows, ...(rows.length ? [totals] : [[text("No students match these filters.", { fontStyle: "italic" })]])],
    columns: [5, 28, 22, 26, 18, 22, 11, 10, 10, 10, 10, 11, 11].map((width) => ({ width })),
    stickyRowsCount: title.length + 1,
  };
}

const DOC_HEADER = ["Student", "Student ID", "Processing officer", "Destination", "Section", "Document", "Status", "Uploaded", "Approved on", "Deadline", "Note"];
const DOC_WIDTHS = [26, 22, 20, 22, 26, 48, 16, 13, 13, 13, 44];

function docRows(students: readonly ChecklistStudent[], keep: (d: ChecklistDoc) => boolean): WorkbookCell[][] {
  const rows: WorkbookCell[][] = [];
  for (const s of students) {
    for (const section of s.sections) {
      for (const d of section.docs) {
        if (!keep(d)) continue;
        rows.push([
          text(s.name),
          text(s.code),
          text(s.officer ?? "Not assigned"),
          text(s.countries.join(", ")),
          text(section.label),
          text(d.name, { wrap: true }),
          text(CHECKLIST_STATE_LABELS[d.state], STATE_STYLE[d.state]),
          dateCell(d.uploadedAt, "moment"),
          dateCell(d.state === "approved" ? d.verifiedAt : null, "moment"),
          dateCell(d.deadline, "day", d.overdue ? { textColor: "#991B1B", fontWeight: "bold" } : {}),
          text(noteFor(d), { wrap: true }),
        ]);
      }
    }
  }
  return rows;
}

function docSheet(name: string, students: readonly ChecklistStudent[], keep: (d: ChecklistDoc) => boolean, empty: string): WorkbookSheet {
  const rows = docRows(students, keep);
  return {
    sheet: name,
    data: [DOC_HEADER.map((h) => text(h, HEADER)), ...(rows.length ? rows : [[text(empty, { fontStyle: "italic" })]])],
    columns: DOC_WIDTHS.map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
  };
}

export type WorkbookMeta = {
  /** "2 Nov 2026" */
  preparedOn: string;
  preparedBy: string | null;
  /** describeFilters(...) */
  filters: string;
};

export function checklistWorkbookSheets(report: ChecklistReport, meta: WorkbookMeta): WorkbookSheet[] {
  return [
    summarySheet(report, meta),
    docSheet("Checklist", report.students, () => true, "No documents for these students."),
    docSheet("Still to do", report.students, (d) => d.state !== "approved", "Nothing left: every document is approved."),
  ];
}
