// Applications & portal logins as a workbook: three sheets, built from the
// same ApplicationsReport the page and the PDF draw.
//
//   Summary        one row per student: how many applications, how many in
//                  progress, at an offer or later, ended, and with a login
//   Applications   one row per application, with its status and the login
//                  saved against it — the sheet to filter
//   Portal logins  only the logins, one row each
//
// Every sheet opens with a line saying it holds passwords: a workbook gets
// forwarded, and whoever opens it should know what it is before scrolling.
//
// Pure: the route hands these sheets to write-excel-file.

import { DEADLINE_SOON_DAYS, GROUP_LABELS, type ApplicationsReport, type AppLogin, type ReportApplication, type StageGroup } from "./applicationsReport.ts";
import type { CellStyle, WorkbookCell, WorkbookSheet } from "./documentChecklistWorkbook.ts";

const HEADER: CellStyle = { fontWeight: "bold", backgroundColor: "#E6F4EE", borderColor: "#B7DCC8", borderStyle: "thin", alignVertical: "center", wrap: true };
const CONFIDENTIAL = "CONFIDENTIAL — contains passwords. Keep it inside the office; do not forward it.";
const BANNER: CellStyle = { fontWeight: "bold", textColor: "#B91C1C" };

const GROUP_STYLE: Record<StageGroup, CellStyle> = {
  accepted: { backgroundColor: "#DCFCE7", textColor: "#166534", fontWeight: "bold" },
  progress: { backgroundColor: "#DBEAFE", textColor: "#1E3A8A" },
  closed: { backgroundColor: "#F3F4F6", textColor: "#374151" },
  rejected: { backgroundColor: "#FEE2E2", textColor: "#991B1B" },
};

const DATE_FORMAT = "dd mmm yyyy";

/** A deadline a week or less away, as the PDF and the page show it: amber. */
const SOON: CellStyle = { backgroundColor: "#FEF3C7", textColor: "#92400E", fontWeight: "bold" };
const PASSED: CellStyle = { textColor: "#991B1B", fontWeight: "bold" };

const text = (value: string | null | undefined, style: CellStyle = {}): WorkbookCell => ({ type: String, value: value || undefined, ...style });
const num = (value: number, style: CellStyle = {}): WorkbookCell => ({ type: Number, value, ...style });

function dateCell(value: string | null, kind: "day" | "moment", style: CellStyle = {}): WorkbookCell {
  if (!value) return text(null, style);
  let day: string | null = null;
  if (kind === "day") day = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  else {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) day = at.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  }
  if (!day) return text(value, style);
  return { type: Date, value: new Date(`${day}T00:00:00Z`), format: DATE_FORMAT, ...style };
}

/** Several logins on one application share a cell, one per line. */
const lines = (logins: readonly AppLogin[], pick: (l: AppLogin) => string | null) => logins.map((l) => pick(l) || "—").join("\n");

export type ApplicationsWorkbookMeta = { preparedOn: string; preparedBy: string | null; filters: string; loginsError: string | null };

function summarySheet(report: ApplicationsReport, meta: ApplicationsWorkbookMeta): WorkbookSheet {
  const t = report.totals;
  const title: WorkbookCell[][] = [
    [text("HMARK Consultants — Applications & portal logins", { fontWeight: "bold", fontSize: 14 })],
    [text(CONFIDENTIAL, BANNER)],
    [text(`Prepared ${meta.preparedOn}${meta.preparedBy ? ` by ${meta.preparedBy}` : ""} · ${meta.filters}`, { fontStyle: "italic", textColor: "#4B5563" })],
    [
      text(
        `${t.students} student${t.students === 1 ? "" : "s"} · ${t.total} application${t.total === 1 ? "" : "s"} · ${t.progress} in progress · ${t.accepted} at an offer or later · ${t.closed + t.rejected} ended · ${t.withLogin} with a login saved`,
        { fontWeight: "bold" }
      ),
    ],
    ...(meta.loginsError ? [[text(`The logins could not be read: ${meta.loginsError}`, BANNER)]] : []),
    [],
  ];
  const header = [
    "#",
    "Student",
    "Student ID",
    "Destination",
    "Intake",
    "Processing officer",
    "Applications",
    GROUP_LABELS.progress,
    GROUP_LABELS.accepted,
    GROUP_LABELS.closed,
    GROUP_LABELS.rejected,
    "Logins saved",
    `Due within ${DEADLINE_SOON_DAYS} days`,
  ].map((h) => text(h, HEADER));
  const rows = report.students.map((s, i): WorkbookCell[] => {
    const none = s.counts.total === 0 ? { fontStyle: "italic" as const, textColor: "#6B7280" } : {};
    return [
      num(i + 1),
      text(s.name, { fontWeight: "bold" }),
      text(s.code ?? "No Student ID yet", s.code ? {} : { fontStyle: "italic", textColor: "#6B7280" }),
      text(s.countries.join(", ") || "—"),
      text(s.intake),
      text(s.officer ?? "Not assigned", s.officer ? {} : { fontStyle: "italic", textColor: "#6B7280" }),
      s.counts.total === 0 && s.allApplications === 0 ? text("No application yet", none) : num(s.counts.total),
      num(s.counts.progress),
      num(s.counts.accepted, s.counts.accepted ? { textColor: "#166534", fontWeight: "bold" } : {}),
      num(s.counts.closed),
      num(s.counts.rejected, s.counts.rejected ? { textColor: "#991B1B" } : {}),
      num(s.counts.withLogin),
      num(s.counts.dueSoon, s.counts.dueSoon ? SOON : {}),
    ];
  });
  const totalStyle: CellStyle = { fontWeight: "bold", backgroundColor: "#F3F4F6", borderColor: "#D1D5DB", borderStyle: "thin" };
  const totals: WorkbookCell[] = [
    text(null, totalStyle),
    text("Total", totalStyle),
    ...[0, 1, 2, 3].map(() => text(null, totalStyle)),
    num(t.total, totalStyle),
    num(t.progress, totalStyle),
    num(t.accepted, totalStyle),
    num(t.closed, totalStyle),
    num(t.rejected, totalStyle),
    num(t.withLogin, totalStyle),
    num(t.dueSoon, totalStyle),
  ];
  return {
    sheet: "Summary",
    data: [...title, header, ...rows, ...(rows.length ? [totals] : [[text("No students match these filters.", { fontStyle: "italic" })]])],
    columns: [5, 28, 22, 26, 18, 22, 13, 12, 13, 13, 11, 12, 13].map((width) => ({ width })),
    stickyRowsCount: title.length + 1,
  };
}

const APP_HEADER = [
  "Student",
  "Student ID",
  "Processing officer",
  "#",
  "Country",
  "University",
  "City",
  "Programme",
  "Level",
  "Intake",
  "Round",
  "Deadline",
  "Days left",
  "Status",
  "Stage",
  "Step",
  "Finalized",
  "Apply at",
  "Login",
  "Username",
  "Password",
  "Login link",
  "Login updated",
];
const APP_WIDTHS = [26, 22, 20, 5, 18, 36, 14, 40, 12, 16, 16, 13, 10, 20, 26, 9, 18, 36, 20, 28, 22, 36, 13];

function applicationsSheet(report: ApplicationsReport): WorkbookSheet {
  const rows: WorkbookCell[][] = [];
  for (const s of report.students) {
    for (const a of s.applications) rows.push(applicationRow(s, a));
  }
  return {
    sheet: "Applications",
    data: [[text(CONFIDENTIAL, BANNER)], APP_HEADER.map((h) => text(h, HEADER)), ...(rows.length ? rows : [[text("No applications for these students.", { fontStyle: "italic" })]])],
    columns: APP_WIDTHS.map((width) => ({ width })),
    stickyRowsCount: 2,
    stickyColumnsCount: 1,
  };
}

function applicationRow(s: ApplicationsReport["students"][number], a: ReportApplication): WorkbookCell[] {
  const multi = a.logins.length > 1 ? { wrap: true } : {};
  return [
    text(s.name),
    text(s.code),
    text(s.officer ?? "Not assigned"),
    num(a.number),
    text(a.country),
    text(a.university, { fontWeight: "bold" }),
    text(a.city),
    text(a.programme, { wrap: true }),
    text(a.level),
    text(a.intake),
    text(a.round),
    dateCell(a.deadline, "day", a.deadlineSoon ? SOON : a.deadlinePassed ? PASSED : {}),
    // A number to sort by, for the ones still running; "Passed" once it has gone by.
    a.group !== "progress" || a.daysLeft === null
      ? text(null)
      : a.daysLeft < 0
        ? text("Passed", PASSED)
        : num(a.daysLeft, a.deadlineSoon ? SOON : {}),
    text(GROUP_LABELS[a.group], GROUP_STYLE[a.group]),
    text(a.stageLabel),
    text(a.step ? `${a.step.step} of ${a.step.of}` : null),
    text(a.finalizedBadge),
    text(a.portalLink),
    a.logins.length ? text(lines(a.logins, (l) => l.label), multi) : text("No login saved", { fontStyle: "italic", textColor: "#6B7280" }),
    text(lines(a.logins, (l) => l.username), { ...multi, fontFamily: "Consolas" }),
    text(lines(a.logins, (l) => l.password), { ...multi, fontFamily: "Consolas" }),
    text(lines(a.logins, (l) => l.link), multi),
    a.logins.length === 1 ? dateCell(a.logins[0].updatedAt, "moment") : text(lines(a.logins, (l) => l.updatedAt?.slice(0, 10) ?? null), multi),
  ];
}

const LOGIN_HEADER = ["Student", "Student ID", "#", "University", "Programme", "Status", "Login", "Username", "Password", "Link", "Updated"];
const LOGIN_WIDTHS = [26, 22, 5, 36, 40, 20, 20, 28, 22, 40, 13];

function loginsSheet(report: ApplicationsReport, meta: ApplicationsWorkbookMeta): WorkbookSheet {
  const rows: WorkbookCell[][] = [];
  for (const s of report.students) {
    for (const a of s.applications) {
      for (const l of a.logins) {
        rows.push([
          text(s.name),
          text(s.code),
          num(a.number),
          text(a.university, { fontWeight: "bold" }),
          text(a.programme, { wrap: true }),
          text(GROUP_LABELS[a.group], GROUP_STYLE[a.group]),
          text(l.label),
          text(l.username, { fontFamily: "Consolas" }),
          text(l.password, { fontFamily: "Consolas" }),
          text(l.link ?? a.portalLink),
          dateCell(l.updatedAt, "moment"),
        ]);
      }
    }
  }
  const empty = meta.loginsError ? `The logins could not be read: ${meta.loginsError}` : "No login is saved against these applications.";
  return {
    sheet: "Portal logins",
    data: [[text(CONFIDENTIAL, BANNER)], LOGIN_HEADER.map((h) => text(h, HEADER)), ...(rows.length ? rows : [[text(empty, { fontStyle: "italic" })]])],
    columns: LOGIN_WIDTHS.map((width) => ({ width })),
    stickyRowsCount: 2,
    stickyColumnsCount: 1,
  };
}

export function applicationsWorkbookSheets(report: ApplicationsReport, meta: ApplicationsWorkbookMeta): WorkbookSheet[] {
  return [summarySheet(report, meta), applicationsSheet(report), loginsSheet(report, meta)];
}
