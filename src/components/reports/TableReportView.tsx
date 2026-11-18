import { TableFrame } from "@/components/ui/TableFrame";
import { TONE_COLOURS, type TableReport } from "@/lib/reports/tableReport";

/**
 * A table report on screen: its summary figures and its rows, grouped as the
 * PDF groups them. The same TableReport the PDF and the Excel file are made
 * from, so the three always agree.
 */
export function TableReportView({ report }: { report: TableReport }) {
  return (
    <div className="flex flex-col gap-4" data-table-report>
      <p className="text-xs text-muted" data-report-filters>
        {report.filters}
      </p>
      <div className="flex flex-wrap gap-3">
        {report.summary.map((s) => (
          <div
            key={s.label}
            className="min-w-32 rounded-md border border-border border-t-[3px] bg-card px-3 py-2"
            style={{ borderTopColor: s.tone ? TONE_COLOURS[s.tone].text : "var(--primary)" }}
            data-report-summary={s.label}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted">{s.label}</div>
            <div className="text-lg font-semibold text-ink tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      {report.rows.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-4 py-6 text-sm text-muted" data-report-empty>
          {report.empty}
        </p>
      ) : (
        <TableFrame label={report.title}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                {report.columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.flatMap((r, i) => {
                const out = [];
                // A heading where the group changes from the row before.
                if (r.group !== undefined && r.group !== report.rows[i - 1]?.group) {
                  out.push(
                    <tr key={`g${i}`} className="bg-primary/10" data-report-group>
                      <td colSpan={report.columns.length} className="px-3 py-1.5 text-xs font-semibold text-ink">
                        {r.group}
                      </td>
                    </tr>
                  );
                }
                const tone = r.tone ? TONE_COLOURS[r.tone] : null;
                out.push(
                  <tr key={`r${i}`} className="border-b border-border align-top" style={tone ? { backgroundColor: tone.fill } : undefined} data-report-row>
                    {report.columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 text-xs ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                        style={tone ? { color: tone.text } : undefined}
                        data-cell={c.key}
                      >
                        {r.cells[c.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                );
                return out;
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
      {report.note && <p className="text-xs text-muted">{report.note}</p>}
    </div>
  );
}
