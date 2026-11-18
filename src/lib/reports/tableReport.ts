// A report that is a table: the shape the consultancy fee, applications and
// university deadlines reports are built in (2026-11-18), so the page, the
// PDF (src/lib/pdf/TableReportDocument.tsx) and the Excel workbook are drawn
// from one set of rows and cannot disagree.
//
// Pure — no portal imports — so the unit tests load it under plain Node.
import type { WorkbookCell, WorkbookSheet } from "../documentChecklistWorkbook.ts";

export type TableColumn = {
  key: string;
  header: string;
  /** Its share of the width, against the others' (1 by default). */
  width?: number;
  align?: "left" | "right";
};

export type RowTone = "good" | "warn" | "bad" | "muted";

export type TableRow = {
  /** Rows with the same group are drawn under one heading (a student, a university). */
  group?: string;
  cells: Record<string, string>;
  tone?: RowTone | null;
};

export type TableReport = {
  title: string;
  /** What was chosen, said in words: "Payment overdue · Italy (Public)". */
  filters: string;
  preparedOn: string;
  preparedBy: string | null;
  summary: { label: string; value: string; tone?: RowTone }[];
  columns: TableColumn[];
  rows: TableRow[];
  /** Said when there are no rows. */
  empty: string;
  /** A line under the table: what a category means, where a figure comes from. */
  note?: string;
};

export const TONE_COLOURS: Record<RowTone, { fill: string; text: string }> = {
  good: { fill: "#DCFCE7", text: "#166534" },
  warn: { fill: "#FEF3C7", text: "#92400E" },
  bad: { fill: "#FEE2E2", text: "#991B1B" },
  muted: { fill: "#F1F5F9", text: "#475569" },
};

/** "Consultancy fee — Payment overdue - 2026-11-18.pdf": safe on every system. */
export function reportFileName(title: string, today: string, format: "pdf" | "xlsx", detail?: string | null): string {
  const clean = (v: string) => v.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = [clean(title), detail ? clean(detail) : "", today].filter(Boolean);
  return `${parts.join(" - ")}.${format}`;
}

const HEADER: WorkbookCell = { type: String, fontWeight: "bold", backgroundColor: "#E6F4EE", borderColor: "#B7DCC8", borderStyle: "thin", wrap: true, alignVertical: "center" };

/**
 * The report as one Excel sheet: its title and filters above, then a header
 * row and one row per line, the group as the first column so the sheet can be
 * filtered by it. Frozen under the header.
 */
export function tableReportSheet(report: TableReport, sheet = "Report"): WorkbookSheet {
  const grouped = report.rows.some((r) => r.group);
  const groupHeader = grouped ? [{ ...HEADER, value: "Group" } as WorkbookCell] : [];
  const width = report.columns.length + (grouped ? 1 : 0);
  const pad = (cells: WorkbookCell[]) => [...cells, ...Array.from({ length: Math.max(0, width - cells.length) }, () => null)];
  const data: WorkbookCell[][] = [
    pad([{ type: String, value: report.title, fontWeight: "bold", fontSize: 14 }]),
    pad([{ type: String, value: report.filters, textColor: "#475569" }]),
    pad([{ type: String, value: `Prepared ${report.preparedOn}${report.preparedBy ? ` by ${report.preparedBy}` : ""}`, textColor: "#475569" }]),
    pad([{ type: String, value: report.summary.map((s) => `${s.label}: ${s.value}`).join("   ·   ") }]),
    pad([]),
    [...groupHeader, ...report.columns.map((c) => ({ ...HEADER, value: c.header, align: c.align === "right" ? ("right" as const) : undefined }) as WorkbookCell)],
  ];
  for (const r of report.rows) {
    const tone = r.tone ? TONE_COLOURS[r.tone] : null;
    const style = tone ? { backgroundColor: tone.fill, textColor: tone.text } : {};
    data.push([
      ...(grouped ? [{ type: String, value: r.group ?? "", ...style } as WorkbookCell] : []),
      ...report.columns.map((c) => ({ type: String, value: r.cells[c.key] ?? "", wrap: true, align: c.align === "right" ? ("right" as const) : undefined, ...style }) as WorkbookCell),
    ]);
  }
  if (report.rows.length === 0) data.push(pad([{ type: String, value: report.empty, fontStyle: "italic" }]));
  if (report.note) data.push(pad([]), pad([{ type: String, value: report.note, fontStyle: "italic", textColor: "#475569" }]));
  return {
    sheet,
    data,
    columns: [...(grouped ? [{ width: 30 }] : []), ...report.columns.map((c) => ({ width: Math.round(14 * (c.width ?? 1)) }))],
    stickyRowsCount: 6,
  };
}
