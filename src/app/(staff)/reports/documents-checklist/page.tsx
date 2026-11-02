import Link from "next/link";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { loadDocumentChecklist } from "@/lib/documentChecklistLoad";
import {
  CHECKLIST_STATE_COLORS,
  CHECKLIST_STATE_LABELS,
  DEFAULT_FILTERS,
  SHOW_LABELS,
  SORT_LABELS,
  checklistQuery,
  parseChecklistFilters,
  type ChecklistCounts,
  type ChecklistShow,
  type ChecklistSort,
  type ChecklistStudent,
} from "@/lib/documentChecklistReport";
import { StatCard } from "@/components/ui/StatCard";
import { TableFrame } from "@/components/ui/TableFrame";
import { Select } from "@/components/ui/Input";
import { VARIANT_CLASSES, SIZE_CLASSES } from "@/components/ui/Button";
import { DownloadChecklistButton } from "./DownloadChecklistButton";

const HREF = "/reports/documents-checklist";

/** A bar in the statuses' colours, as the PDF draws it. */
function StateBar({ counts }: { counts: ChecklistCounts }) {
  const parts: [string, number, string][] = [
    [CHECKLIST_STATE_COLORS.approved, counts.approved, CHECKLIST_STATE_LABELS.approved],
    [CHECKLIST_STATE_COLORS.review, counts.review, CHECKLIST_STATE_LABELS.review],
    [CHECKLIST_STATE_COLORS.missing, counts.missing, CHECKLIST_STATE_LABELS.missing],
    [CHECKLIST_STATE_COLORS.sent_back, counts.sentBack, CHECKLIST_STATE_LABELS.sent_back],
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg" aria-hidden>
      {parts
        .filter(([, n]) => n > 0)
        .map(([color, n, label]) => (
          <div key={label} style={{ flexGrow: n, flexBasis: 0, backgroundColor: color }} />
        ))}
    </div>
  );
}

/** The documents a student still owes, opened from the "Left to do" figure. */
function LeftList({ s }: { s: ChecklistStudent }) {
  const owed = s.sections.flatMap((section) =>
    section.docs.filter((d) => d.state !== "approved").map((d) => ({ ...d, section: section.label }))
  );
  if (owed.length === 0) return <span className="text-success">Nothing left</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none tabular-nums">
        <span className="font-semibold text-danger">{s.counts.left}</span>
        {s.counts.review > 0 && <span className="text-muted"> + {s.counts.review} to review</span>}
        <span className="ml-1 text-xs text-primary group-open:hidden">show</span>
        <span className="ml-1 hidden text-xs text-primary group-open:inline">hide</span>
      </summary>
      <ul className="mt-2 flex max-w-md flex-col gap-1 text-xs">
        {owed.map((d) => (
          <li key={d.id} className="flex gap-2">
            <span className="shrink-0 font-medium" style={{ color: CHECKLIST_STATE_COLORS[d.state] }}>
              {CHECKLIST_STATE_LABELS[d.state]}
            </span>
            <span className="text-ink">
              {d.name}
              <span className="text-muted"> · {d.section}</span>
              {d.reason && <span className="block text-danger">Sent back: {d.reason}</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function DocumentsChecklistPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireReportAccess("/reports/documents-checklist");
  const filters = parseChecklistFilters(await props.searchParams);
  const { report, officers, countries, registered } = await loadDocumentChecklist(supabase, filters);
  const t = report.totals;
  const filtered = checklistQuery(filters) !== "";
  const download = (format: "pdf" | "xlsx") => `${HREF}/download${checklistQuery(filters, { format })}`;

  return (
    <div className="w-full">
      <Link prefetch={false} href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Documents checklist</h2>
          <p className="mt-0.5 text-sm text-muted">
            Every registered student&rsquo;s documents for their current intake: what is approved, what is waiting for review and what is
            still to do.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <DownloadChecklistButton href={download("pdf")} format="pdf" />
          <DownloadChecklistButton href={download("xlsx")} format="xlsx" />
        </div>
      </div>

      <form method="get" action={HREF} className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Processing officer
          <Select name="officer" defaultValue={filters.officer} className="min-w-44">
            <option value="">All officers</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            <option value="none">Not assigned</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Destination
          <Select name="country" defaultValue={filters.country} className="min-w-44">
            <option value="">All destinations</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Show
          <Select name="show" defaultValue={filters.show} className="min-w-56">
            {(Object.keys(SHOW_LABELS) as ChecklistShow[]).map((k) => (
              <option key={k} value={k}>
                {SHOW_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Order
          <Select name="sort" defaultValue={filters.sort} className="min-w-44">
            {(Object.keys(SORT_LABELS) as ChecklistSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={`${VARIANT_CLASSES.primary} ${SIZE_CLASSES.md} rounded-md font-medium`}>
          Apply
        </button>
        {filtered && (
          <Link prefetch={false} href={`${HREF}${checklistQuery(DEFAULT_FILTERS)}`} className="py-1.5 text-sm text-muted hover:text-ink">
            Clear
          </Link>
        )}
        <p className="ml-auto self-center text-xs text-muted" data-showing={t.students}>
          Showing {t.students} of {registered} registered student{registered === 1 ? "" : "s"}. The downloads follow these filters.
        </p>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Students" value={t.students} hint={t.complete ? `${t.complete} with every document approved` : "None complete yet"} />
        <StatCard label="Documents" value={t.total} hint={t.students ? `${Math.round(t.total / t.students)} per student on average` : undefined} />
        <StatCard label="Approved" value={t.approved} tone="success" hint={t.percent === null ? undefined : `${t.percent}% of all documents`} />
        <StatCard label="Awaiting review" value={t.review} tone={t.review ? "warning" : "default"} hint="Uploaded, for staff to check" />
        <StatCard label="Left to do" value={t.left} tone={t.left ? "danger" : "default"} hint={`${t.missing} missing · ${t.sentBack} sent back`} />
      </div>

      <TableFrame label="Documents checklist by student" className="rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-sm" data-documents-checklist>
          <thead>
            <tr className="border-b border-border bg-bg text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="w-12 px-3 py-3 text-right font-medium" data-serial>
                <abbr title="Serial number" className="no-underline">
                  #
                </abbr>
              </th>
              <th className="px-4 py-3" data-frozen>
                Student
              </th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Processing officer</th>
              <th className="px-4 py-3 text-right">Approved</th>
              <th className="px-4 py-3">Left to do</th>
              <th className="w-48 px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((s, i) => (
              <tr key={s.id} className="border-b border-border align-top last:border-0" data-student-row={s.id}>
                <td className="w-12 px-3 py-3 text-right text-xs tabular-nums text-muted" data-serial>
                  {i + 1}
                </td>
                <td className="px-4 py-3" data-frozen>
                  <Link prefetch={false} href={`/students/${s.id}/documents`} className="font-medium text-ink hover:text-primary hover:underline">
                    {s.name}
                  </Link>
                  <div className="font-mono text-xs text-muted">{s.code ?? "No Student ID yet"}</div>
                </td>
                <td className="px-4 py-3 text-muted">{s.countries.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-muted">{s.officer ?? <span className="italic">Not assigned</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="font-semibold text-success">{s.counts.approved}</span>
                  <span className="text-muted"> / {s.counts.total}</span>
                </td>
                <td className="px-4 py-3">
                  {s.counts.total === 0 ? <span className="text-xs italic text-muted">No checklist yet</span> : <LeftList s={s} />}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StateBar counts={s.counts} />
                    <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">{s.percent === null ? "—" : `${s.percent}%`}</span>
                  </div>
                </td>
              </tr>
            ))}
            {report.students.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["approved", "review", "missing", "sent_back"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHECKLIST_STATE_COLORS[k] }} />
            {CHECKLIST_STATE_LABELS[k]}
          </span>
        ))}
        <span>Approved = checked and accepted by staff. Left to do = missing + sent back.</span>
      </div>
    </div>
  );
}
