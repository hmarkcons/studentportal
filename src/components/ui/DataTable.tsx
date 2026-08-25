"use client";

import { useState } from "react";

type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  csv?: (row: T) => string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectable = false,
  exportFilename,
}: {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  exportFilename?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function exportCsv() {
    const csvCols = columns.filter((c) => c.csv);
    const header = csvCols.map((c) => c.header).join(",");
    const lines = rows
      .filter((r) => selected.size === 0 || selected.has(r.id))
      .map((r) => csvCols.map((c) => `"${(c.csv?.(r) ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {exportFilename && (
        <div className="flex justify-end border-b border-border bg-bg px-3 py-2">
          <button onClick={exportCsv} className="text-xs font-medium text-primary hover:underline">
            Export
          </button>
        </div>
      )}
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
            {selectable && (
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-bg/60">
              {selectable && (
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-muted">
                No records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
