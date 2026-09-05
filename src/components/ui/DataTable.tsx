"use client";

import { useMemo, useState } from "react";

// Server Component pages build `cells`/`csv` for every row up front (calling
// their own render logic server-side) instead of passing render/csv
// functions through this client component's props — a function can't cross
// the server->client boundary (only already-resolved nodes/strings can).
type Column = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  exportable?: boolean;
};

type Row = {
  id: string;
  cells: Record<string, React.ReactNode>;
  csv?: Record<string, string>;
};

type FilterDef = {
  key: string;
  label: string;
  options: string[];
};

export function DataTable({
  columns,
  rows,
  selectable = false,
  exportFilename,
  searchable = false,
  searchPlaceholder = "Search…",
  filters = [],
  minTableWidthClassName = "min-w-[640px]",
}: {
  columns: Column[];
  rows: Row[];
  selectable?: boolean;
  exportFilename?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  // A wider floor for tables with many columns (or many filters, crowding the
  // toolbar) — spreads columns out instead of squeezing their content, at the
  // cost of a horizontal scrollbar on narrower screens.
  minTableWidthClassName?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const haystack = Object.values(row.csv ?? {}).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      for (const f of filters) {
        const want = filterValues[f.key];
        if (!want) continue;
        const cell = row.csv?.[f.key] ?? "";
        const parts = cell.split(",").map((p) => p.trim());
        if (!parts.includes(want)) return false;
      }
      return true;
    });
  }, [rows, search, filterValues, filters]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id))));
  }

  function exportCsv() {
    const exportColumns = columns.filter((c) => c.exportable !== false);
    const header = exportColumns.map((c) => c.header).join(",");
    const lines = visibleRows
      .filter((r) => selected.size === 0 || selected.has(r.id))
      .map((r) => exportColumns.map((c) => `"${(r.csv?.[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showToolbar = exportFilename || searchable || filters.length > 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {searchable && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              />
            )}
            {filters.map((f) => (
              <select
                key={f.key}
                value={filterValues[f.key] ?? ""}
                onChange={(e) => setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              >
                <option value="">{f.label}: all</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ))}
            {(search || Object.values(filterValues).some(Boolean)) && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterValues({});
                }}
                className="text-xs text-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          {exportFilename && (
            <button onClick={exportCsv} className="text-xs font-medium text-primary hover:underline">
              Export
            </button>
          )}
        </div>
      )}
      <table className={`w-full ${minTableWidthClassName} text-sm`}>
        <thead>
          <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
            {selectable && (
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === visibleRows.length && visibleRows.length > 0}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-bg/60">
              {selectable && (
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                </td>
              )}
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""}`}
                >
                  {row.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {visibleRows.length === 0 && (
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
