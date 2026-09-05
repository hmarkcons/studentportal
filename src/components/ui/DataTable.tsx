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
  pageSize,
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
  // Opt-in: when set, only this many matching rows are rendered at once, with
  // Prev/Next controls below the table — every other DataTable caller keeps
  // rendering every row exactly as before. Search/filter/export still run
  // over the full `rows` array regardless, only which rows get mounted into
  // the DOM changes — the actual problem this solves is that Next.js
  // prefetches every visible row's own <Link>, each one a real page's worth
  // of server-side data fetching, so a long unpaginated list turns into that
  // many prefetch round trips the moment the page paints.
  pageSize?: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

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

  const pageCount = pageSize ? Math.max(1, Math.ceil(visibleRows.length / pageSize)) : 1;
  // Search/filter changes can shrink the result set below the current page
  // (or the underlying data can too) — clamp rather than strand the user on
  // a blank page they'd otherwise have to manually back out of.
  const currentPage = Math.min(page, pageCount);
  const pagedRows = pageSize ? visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : visibleRows;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateFilter(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearSearchAndFilters() {
    setSearch("");
    setFilterValues({});
    setPage(1);
  }

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
                onChange={(e) => updateSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs"
              />
            )}
            {filters.map((f) => (
              <select
                key={f.key}
                value={filterValues[f.key] ?? ""}
                onChange={(e) => updateFilter(f.key, e.target.value)}
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
              <button onClick={clearSearchAndFilters} className="text-xs text-muted hover:text-ink">
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
          {pagedRows.map((row) => (
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
      {pageSize && pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border bg-bg px-3 py-2 text-xs text-muted">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleRows.length)} of {visibleRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
