"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import { TableFrame } from "@/components/ui/TableFrame";

// Server Component pages build `cells`/`csv` for every row up front (calling
// their own render logic server-side) instead of passing render/csv
// functions through this client component's props — a function can't cross
// the server->client boundary (only already-resolved nodes/strings can).
type Column = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  exportable?: boolean;
  /**
   * Keeps this column wrapping when the table is in one-line mode — for cells
   * that hold an inline editor and need the room rather than a single line.
   */
  wrap?: boolean;
  /**
   * A ceiling on how wide this column may get, e.g. "max-w-[22rem]".
   *
   * Only useful with `wrap`: a cell holding a paragraph will otherwise take
   * whatever width it likes and push the table sideways, which is the thing
   * wrapping was supposed to prevent. Capped, the text runs onto as many
   * lines as it needs and the table stays within the screen.
   */
  widthClassName?: string;
};

type Row = {
  id: string;
  cells: Record<string, React.ReactNode>;
  csv?: Record<string, string>;
  /**
   * A colour for the whole row, with rowHighlight (globals.css, data-tone):
   * the applications list's offers green and rejections red.
   */
  tone?: string;
};

/** A page longer than this is drawn a window at a time (virtualRowHeight). */
const VIRTUAL_MIN_ROWS = 120;
/** Rows drawn above and below what is on screen, so a scroll does not outrun them. */
const OVERSCAN = 30;
/** Rows drawn before the browser has measured anything: the first screenful and some. */
const FIRST_WINDOW = 60;

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
  // Keeps every cell on one line and lets the table run wider than the screen,
  // scrolling sideways, instead of wrapping names and numbers onto two and
  // three lines. Off by default so the report tables are untouched.
  oneLine = false,
  pageSize,
  freezeColumn,
  label,
  serial = true,
  exportHref,
  rowHighlight = false,
  server,
  dense = false,
  expandable = false,
  virtualRowHeight,
  expandedHeading,
  gridLines = false,
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
  oneLine?: boolean;
  // Opt-in: when set, only this many matching rows are rendered at once, with
  // Prev/Next controls below the table — every other DataTable caller keeps
  // rendering every row exactly as before. Search/filter/export still run
  // over the full `rows` array regardless, only which rows get mounted into
  // the DOM changes — the actual problem this solves is that Next.js
  // prefetches every visible row's own <Link>, each one a real page's worth
  // of server-side data fetching, so a long unpaginated list turns into that
  // many prefetch round trips the moment the page paints.
  pageSize?: number;
  /**
   * The column that says whose row it is, frozen at the left while the table
   * scrolls sideways (see TableFrame). Defaults to the first column; the
   * leads and students lists freeze the name, which comes after the month.
   */
  freezeColumn?: string;
  /** What the table is, for a screen reader. Defaults to the export name. */
  label?: string;
  /**
   * A serial-number column first: 1, 2, 3 down the rows as they are shown —
   * after search and filters, and carrying on across pages — so "row 14" means
   * the same thing to two people looking at the same list. On by default.
   */
  serial?: boolean;
  /**
   * A file to download for Export instead of the CSV made from the rows shown
   * — the leads list's Excel workbook, which the import reads back.
   */
  exportHref?: string;
  /**
   * Rows easy to follow across a wide table: every other one shaded, the one
   * under the pointer brighter, and the one last clicked held until another
   * is (globals.css, data-row-highlight).
   */
  rowHighlight?: boolean;
  /**
   * Server-side paging: `rows` is one page, already searched and filtered by
   * the server, and `total` how many match in all. Search (after a pause),
   * a filter or a page then changes the address — ?q=, ?f_<key>=, ?page= — and
   * the server sends that page. For a list too long to send whole: the leads.
   */
  server?: { page: number; total: number; search: string; filters: Record<string, string> };
  /**
   * Rows as shallow as their contents allow, so more of a long list is on the
   * screen at once: the leads and registered students, read row after row.
   */
  dense?: boolean;
  /**
   * An Expand button that opens the table over the whole window — no sidebar,
   * no page heading — with its search, filters and pages kept. Escape, or the
   * button again, puts it back.
   */
  expandable?: boolean;
  /**
   * Draws a long page a window at a time: the rows on screen, and a screenful
   * either side, with the rest stood in for by empty space of the same
   * height — so the scrollbar covers every row and a scroll brings the next
   * ones in. The number is a row's expected height in pixels; the rows drawn
   * are measured, and that is used once there are some.
   *
   * For the leads list's thousand rows, each with its own status, counsellor,
   * remark and follow-up controls: drawing all of them took longer than
   * fetching them. A page of VIRTUAL_MIN_ROWS rows or fewer is drawn whole.
   */
  virtualRowHeight?: number;
  /**
   * What the table is, said above it once it is expanded over the whole
   * window, where the page's own heading — whose applications these are — is
   * no longer on screen.
   */
  expandedHeading?: React.ReactNode;
  /**
   * Ruled like a spreadsheet: a line between every column as well as every
   * row (globals.css, data-grid) — the applications table, wide enough that
   * an eye following a row across it wanted the columns marked.
   */
  gridLines?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(server?.search ?? "");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(server?.filters ?? {});
  const [page, setPage] = useState(1);
  const [currentRow, setCurrentRow] = useState<string | null>(null);
  const router = useRouter();
  const [navigating, startNavigating] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const [rowWindow, setRowWindow] = useState({ start: 0, end: FIRST_WINDOW, rowHeight: virtualRowHeight ?? 0 });

  // Open over the whole window: the page behind does not scroll, and Escape
  // closes it — unless a pop-up opened from a cell is what Escape is for.
  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  // Cell padding: the usual, or shallow rows (dense).
  const cellPad = dense ? "px-3 py-1" : "px-4 py-3";
  const headPad = dense ? "px-3 py-2" : "px-4 py-3";

  /** Server mode: the same address with these parameters changed — empty removes one. */
  function go(changes: Record<string, string | null>, { scroll = false }: { scroll?: boolean } = {}) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    startNavigating(() => router.push(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll }));
  }

  const visibleRows = useMemo(() => {
    // The server has already searched and filtered what it sent.
    if (server) return rows;
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
  }, [rows, search, filterValues, filters, server]);

  /** How many match in all — the server's count, or what is held here. */
  const matchCount = server ? server.total : visibleRows.length;
  const pageCount = pageSize ? Math.max(1, Math.ceil(matchCount / pageSize)) : 1;
  // Search/filter changes can shrink the result set below the current page
  // (or the underlying data can too) — clamp rather than strand the user on
  // a blank page they'd otherwise have to manually back out of.
  const currentPage = Math.min(server ? server.page : page, pageCount);
  const pagedRows = server || !pageSize ? visibleRows : visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const virtual = Boolean(virtualRowHeight) && pagedRows.length > VIRTUAL_MIN_ROWS;
  const rowCount = pagedRows.length;

  // Which rows to draw: worked out from where the table's window is scrolled
  // to (TableFrame's frame is what scrolls), again as it scrolls and as it
  // changes size — the page scrolling it up, Expand. In steps of ten rows, so
  // a scroll redraws a few rows at a time rather than on every pixel.
  useEffect(() => {
    if (!virtual) return;
    const table = tableRef.current;
    const frame = table?.closest<HTMLElement>("[data-table-frame]");
    if (!table || !frame) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // The rows drawn, measured: what a row really takes on this screen.
        const drawn = table.tBodies[0]?.querySelectorAll<HTMLElement>("tr[data-row]") ?? [];
        let height = virtualRowHeight ?? 37;
        if (drawn.length > 10) {
          const first = drawn[0].getBoundingClientRect();
          const last = drawn[drawn.length - 1].getBoundingClientRect();
          height = (last.bottom - first.top) / drawn.length;
        }
        const top = Math.max(0, frame.scrollTop - (table.tHead?.offsetHeight ?? 0));
        const start = Math.max(0, Math.floor(top / height / 10) * 10 - OVERSCAN);
        const end = Math.min(rowCount, Math.ceil((top + frame.clientHeight) / height / 10) * 10 + OVERSCAN);
        setRowWindow((w) =>
          w.start === start && w.end === end && Math.abs(w.rowHeight - height) < 0.5 ? w : { start, end, rowHeight: height }
        );
      });
    };
    measure();
    frame.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => {
      cancelAnimationFrame(raf);
      frame.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [virtual, virtualRowHeight, rowCount]);

  // A new page, search or filter starts at the top of its rows — when it
  // changes, not when the table first appears, or a scroll begun while the
  // page was still loading would be thrown back to the top.
  const listKey = server ? `${server.page}|${server.search}|${JSON.stringify(server.filters)}` : "";
  const shownKey = useRef(listKey);
  useEffect(() => {
    if (shownKey.current === listKey) return;
    shownKey.current = listKey;
    const frame = tableRef.current?.closest<HTMLElement>("[data-table-frame]");
    if (frame && virtual) frame.scrollTop = 0;
  }, [listKey, virtual]);

  const drawStart = virtual ? Math.min(rowWindow.start, rowCount) : 0;
  const drawEnd = virtual ? Math.min(rowWindow.end, rowCount) : rowCount;
  const drawnRows = virtual ? pagedRows.slice(drawStart, drawEnd) : pagedRows;
  const columnCount = columns.length + (selectable ? 1 : 0) + (serial ? 1 : 0);
  const spacer = (rows: number, where: string) =>
    rows > 0 ? (
      <tr aria-hidden data-spacer={where} style={{ height: rows * rowWindow.rowHeight }}>
        <td colSpan={columnCount} className="p-0" />
      </tr>
    ) : null;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
    if (server) {
      // Asked of the server once typing pauses, not at every key.
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => go({ q: value.trim() || null, page: null }), 400);
    }
  }

  function updateFilter(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    if (server) go({ [`f_${key}`]: value || null, page: null });
  }

  function clearSearchAndFilters() {
    setSearch("");
    setFilterValues({});
    setPage(1);
    if (server) go({ q: null, page: null, ...Object.fromEntries(filters.map((f) => [`f_${f.key}`, null])) });
  }

  function toPage(n: number, where: "top" | "bottom") {
    if (server) go({ page: n > 1 ? String(n) : null }, { scroll: where === "bottom" });
    else setPage(n);
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
    const header = [...(serial ? ["S.No."] : []), ...exportColumns.map((c) => c.header)].join(",");
    const lines = visibleRows
      .filter((r) => selected.size === 0 || selected.has(r.id))
      .map((r, i) =>
        [...(serial ? [String(i + 1)] : []), ...exportColumns.map((c) => `"${(r.csv?.[c.key] ?? "").replace(/"/g, '""')}"`)].join(",")
      );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showToolbar = exportFilename || exportHref || searchable || filters.length > 0 || expandable;
  const frozenKey = freezeColumn ?? columns[0]?.key;

  const pager = (where: "top" | "bottom") =>
    pageSize ? (
      <div
        className={`flex items-center justify-between bg-bg px-3 py-2 text-xs text-muted ${where === "top" ? "border-b" : "border-t"} border-border`}
        data-pager={where}
      >
        <span>
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, matchCount)} of {matchCount}
          {navigating && <span className="ml-2 text-primary">Loading…</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toPage(Math.max(1, currentPage - 1), where)}
            disabled={currentPage <= 1 || navigating}
            className="rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => toPage(Math.min(pageCount, currentPage + 1), where)}
            disabled={currentPage >= pageCount || navigating}
            className="rounded-md border border-border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    ) : null;

  return (
    // The rounded border is the card; the table scrolls in a window inside it
    // (TableFrame), with the search, filters and pager outside the window so
    // they stay where they are while the rows move.
    <div
      className={expanded ? "overflow-hidden" : "overflow-hidden rounded-lg border border-border"}
      data-table-expanded={expanded || undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? `${label ?? exportFilename ?? "Table"}, full screen` : undefined}
    >
      {expanded && expandedHeading && (
        <div className="border-b border-border bg-card px-4 py-2.5" data-expanded-heading>
          {expandedHeading}
        </div>
      )}
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
                // Capped: a list is as wide as its longest choice, and one long
                // city name pushed the toolbar onto three lines.
                className="max-w-[12rem] rounded-md border border-border bg-card px-2 py-1 text-xs"
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
          <div className="flex items-center gap-3">
            {exportHref ? (
              <a href={exportHref} className="text-xs font-medium text-primary hover:underline" data-export-link>
                Export (Excel)
              </a>
            ) : (
              exportFilename && (
                <button onClick={exportCsv} className="text-xs font-medium text-primary hover:underline">
                  Export
                </button>
              )
            )}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-pressed={expanded}
                title={expanded ? "Back to the page (Esc)" : "Open the table over the whole screen"}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-ink hover:border-primary"
                data-expand-table
              >
                {expanded ? <Minimize2 aria-hidden className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden className="h-3.5 w-3.5" />}
                {expanded ? "Exit full screen" : "Expand"}
              </button>
            )}
          </div>
        </div>
      )}
      {/* Above the table as well as below it: a page can be a thousand rows
          long, and nobody should scroll past all of them to reach Next. */}
      {pageSize && pageCount > 1 && pager("top")}
      {server && navigating && pageCount <= 1 && <p className="border-b border-border bg-bg px-3 py-1 text-xs text-primary">Loading…</p>}
      <div className={navigating ? "opacity-60 transition-opacity" : undefined} aria-busy={navigating || undefined} data-table-body>
      <TableFrame label={label ?? exportFilename?.replace(/[-_]/g, " ") ?? "Table"} freezeFirstColumn={false}>
        <table
          ref={tableRef}
          className={`w-full ${minTableWidthClassName} text-sm`}
          data-row-highlight={rowHighlight || undefined}
          data-dense={dense || undefined}
          data-grid={gridLines || undefined}
          data-virtual={virtual || undefined}
          data-row-count={rowCount}
          aria-rowcount={virtual ? rowCount + 1 : undefined}
        >
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              {selectable && (
                <th className={headPad}>
                  <input
                    type="checkbox"
                    checked={selected.size === visibleRows.length && visibleRows.length > 0}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {serial && (
                <th scope="col" className={`w-12 ${dense ? "px-2 py-2" : "px-3 py-3"} text-right font-medium`} data-serial>
                  <abbr title="Serial number" className="no-underline">
                    #
                  </abbr>
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  data-frozen={c.key === frozenKey || undefined}
                  className={`${headPad} font-medium ${oneLine && !c.wrap ? "whitespace-nowrap" : ""} ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {virtual && spacer(drawStart, "above")}
            {drawnRows.map((row, j) => {
              // Its place among all the rows, drawn or not.
              const i = drawStart + j;
              return (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-bg/60"
                data-row
                data-alt={i % 2 === 1 || undefined}
                data-tone={row.tone}
                aria-rowindex={virtual ? i + 2 : undefined}
                data-current={(rowHighlight && currentRow === row.id) || undefined}
                onClick={rowHighlight ? () => setCurrentRow(row.id) : undefined}
              >
                {selectable && (
                  <td className={cellPad}>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                )}
                {serial && (
                  <td className={`w-12 ${dense ? "px-2 py-1" : "px-3 py-3"} text-right text-xs tabular-nums text-muted`} data-serial>
                    {(pageSize ? (currentPage - 1) * pageSize : 0) + i + 1}
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-frozen={c.key === frozenKey || undefined}
                    className={`${cellPad} ${oneLine && !c.wrap ? "whitespace-nowrap" : ""} ${
                      c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""
                    }`}
                  >
                    {/* The cap goes on an inner block, not the cell. A max-width
                        on a <td> is ignored under automatic table layout, so
                        putting it there looked right and left a paragraph free
                        to stretch the table to ten thousand pixels. */}
                    {c.widthClassName ? (
                      <div className={`${c.widthClassName} whitespace-normal break-words`}>{row.cells[c.key]}</div>
                    ) : (
                      row.cells[c.key]
                    )}
                  </td>
                ))}
              </tr>
              );
            })}
            {virtual && spacer(rowCount - drawEnd, "below")}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + (serial ? 1 : 0)} className="px-4 py-10 text-center text-muted">
                  No records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
      </div>
      {pageSize && pageCount > 1 && pager("bottom")}
    </div>
  );
}
