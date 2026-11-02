import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireReportAccess } from "@/lib/auth/reportAccess";
import { loadApplicationsReport } from "@/lib/applicationsReportLoad";
import {
  DEFAULT_APP_FILTERS,
  GROUPS,
  GROUP_COLORS,
  GROUP_LABELS,
  LOGIN_FILTER_LABELS,
  SHOW_LABELS,
  STATUS_FILTER_LABELS,
  applicationsQuery,
  parseApplicationsFilters,
  type AppLoginFilter,
  type AppReportStudent,
  type AppShow,
  type AppStatusFilter,
} from "@/lib/applicationsReport";
import { day } from "@/lib/studentReport";
import { StatCard } from "@/components/ui/StatCard";
import { TableFrame } from "@/components/ui/TableFrame";
import { Select } from "@/components/ui/Input";
import { VARIANT_CLASSES, SIZE_CLASSES } from "@/components/ui/Button";
import { ReportDownloadButton } from "@/components/reports/ReportDownloadButton";
import { StudentPicker } from "@/components/reports/StudentPicker";
import { LoginReveal } from "./LoginReveal";

const HREF = "/reports/applications-logins";

/** The order the Status filter offers its choices in. */
const STATUS_ORDER: AppStatusFilter[] = ["all", "progress", "accepted", "ended", "closed", "rejected"];

/** A student's applications, opened from their count: where each stands, and its login. */
function ApplicationList({ s }: { s: AppReportStudent }) {
  if (s.allApplications === 0) return <span className="text-xs italic text-muted">No application yet</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none tabular-nums">
        <span className="font-semibold text-ink">{s.counts.total}</span>
        {s.applications.length < s.allApplications && <span className="text-muted"> of {s.allApplications}</span>}
        <span className="ml-1 text-xs text-primary group-open:hidden">show</span>
        <span className="ml-1 hidden text-xs text-primary group-open:inline">hide</span>
      </summary>
      <ol className="mt-2 flex min-w-[28rem] max-w-2xl flex-col gap-2 text-xs">
        {s.applications.map((a) => (
          <li key={a.id} className="border-l-2 pl-2" style={{ borderColor: GROUP_COLORS[a.group] }} data-application={a.id}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-muted">#{a.number}</span>
              <span className="font-semibold text-ink">{a.university}</span>
              {a.city && <span className="text-muted">· {a.city}</span>}
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: GROUP_COLORS[a.group] }}>
                {GROUP_LABELS[a.group]}
              </span>
              <span className="text-muted">
                {a.stageLabel}
                {a.step && ` · step ${a.step.step} of ${a.step.of}`}
              </span>
            </div>
            <div className="text-muted">
              {[a.programme ?? "Programme not chosen", a.level, a.intake, a.round, a.country].filter(Boolean).join(" · ")}
              {a.deadline && (
                <span className={a.deadlinePassed ? "font-semibold text-danger" : ""}>
                  {" "}
                  · {a.deadlinePassed ? "deadline passed" : "deadline"} {day(a.deadline)}
                </span>
              )}
              {a.finalizedBadge && <span className="font-semibold text-success"> · {a.finalizedBadge}</span>}
            </div>
            {a.logins.map((l, i) => (
              <LoginReveal key={i} label={l.label} username={l.username} password={l.password} link={l.link ?? a.portalLink} />
            ))}
            {a.logins.length === 0 && (
              <div className="italic text-muted" data-no-login>
                No portal login saved
                {a.portalLink && (
                  <>
                    {" · "}
                    <a href={a.portalLink} target="_blank" rel="noopener noreferrer" className="not-italic text-primary hover:underline">
                      apply here
                    </a>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

export default async function ApplicationsLoginsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireReportAccess("/reports/applications-logins");
  const filters = parseApplicationsFilters(await props.searchParams);
  const { report, officers, countries, students, registered, loginsError } = await loadApplicationsReport(supabase, filters);
  const t = report.totals;
  const filtered = applicationsQuery(filters) !== "";
  const download = (format: "pdf" | "xlsx") => `${HREF}/download${applicationsQuery(filters, { format })}`;

  return (
    <div className="w-full">
      <Link prefetch={false} href="/reports" className="text-sm text-muted hover:text-ink">
        &larr; Back to reports
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Applications &amp; portal logins</h2>
          <p className="mt-0.5 text-sm text-muted">
            Every registered student&rsquo;s applications, where each one stands, and the university-portal login saved against it.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-start gap-2">
            <ReportDownloadButton href={download("pdf")} format="pdf" fallbackName="Applications-logins" />
            <ReportDownloadButton href={download("xlsx")} format="xlsx" fallbackName="Applications-logins" />
          </div>
          <p className="inline-flex items-center gap-1 text-xs font-medium text-danger">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            The downloads contain passwords — keep them inside the office.
          </p>
        </div>
      </div>

      {loginsError && (
        <p role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger" data-logins-error>
          The logins could not be read, so none are shown: {loginsError}
        </p>
      )}

      <form method="get" action={HREF} className="mb-5 flex flex-wrap items-start gap-3 rounded-lg border border-border bg-card p-3">
        <StudentPicker options={students} selected={filters.students} />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Processing officer
          <Select name="officer" defaultValue={filters.officer} className="min-w-40">
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
          <Select name="country" defaultValue={filters.country} className="min-w-40">
            <option value="">All destinations</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Status
          <Select name="status" defaultValue={filters.status} className="min-w-44">
            {STATUS_ORDER.map((k) => (
              <option key={k} value={k}>
                {STATUS_FILTER_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Login
          <Select name="login" defaultValue={filters.login} className="min-w-44">
            {(Object.keys(LOGIN_FILTER_LABELS) as AppLoginFilter[]).map((k) => (
              <option key={k} value={k}>
                {LOGIN_FILTER_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Show
          <Select name="show" defaultValue={filters.show} className="min-w-52">
            {(Object.keys(SHOW_LABELS) as AppShow[]).map((k) => (
              <option key={k} value={k}>
                {SHOW_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-3 self-start pt-5">
          <button type="submit" className={`${VARIANT_CLASSES.primary} ${SIZE_CLASSES.md} rounded-md font-medium`}>
            Apply
          </button>
          {filtered && (
            <Link prefetch={false} href={`${HREF}${applicationsQuery(DEFAULT_APP_FILTERS)}`} className="py-1.5 text-sm text-muted hover:text-ink">
              Clear
            </Link>
          )}
        </div>
        <p className="ml-auto self-center text-xs text-muted" data-showing={t.students}>
          Showing {t.students} of {registered} registered student{registered === 1 ? "" : "s"}. The downloads follow these filters.
        </p>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Students" value={t.students} hint={`${t.withApplications} with applications`} />
        <StatCard label="Applications" value={t.total} />
        <StatCard label={GROUP_LABELS.progress} value={t.progress} hint="Still running" />
        <StatCard label={GROUP_LABELS.accepted} value={t.accepted} tone={t.accepted ? "success" : "default"} hint="Offer, acceptance or later" />
        <StatCard label="Logins saved" value={t.withLogin} tone={t.total && t.withLogin < t.total ? "warning" : "default"} hint={`of ${t.total} applications`} />
      </div>

      <TableFrame label="Applications and portal logins by student" className="rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-sm" data-applications-report>
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
              <th className="px-4 py-3">Applications</th>
              <th className="px-4 py-3 text-right">{GROUP_LABELS.accepted}</th>
              <th className="px-4 py-3 text-right">Logins saved</th>
              <th className="w-16 px-2 py-3">
                <span className="sr-only">Download</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((s, i) => (
              <tr key={s.id} className="border-b border-border align-top last:border-0" data-student-row={s.id}>
                <td className="w-12 px-3 py-3 text-right text-xs tabular-nums text-muted" data-serial>
                  {i + 1}
                </td>
                <td className="px-4 py-3" data-frozen>
                  <Link prefetch={false} href={`/students/${s.id}/applications`} className="font-medium text-ink hover:text-primary hover:underline">
                    {s.name}
                  </Link>
                  <div className="font-mono text-xs text-muted">{s.code ?? "No Student ID yet"}</div>
                </td>
                <td className="px-4 py-3 text-muted">{s.countries.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-muted">{s.officer ?? <span className="italic">Not assigned</span>}</td>
                <td className="px-4 py-3">
                  <ApplicationList s={s} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={s.counts.accepted ? "font-semibold text-success" : "text-muted"}>{s.counts.accepted}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {s.counts.total ? (
                    <span className={s.counts.withLogin < s.counts.total ? "text-warning" : "text-success"}>
                      {s.counts.withLogin} / {s.counts.total}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <ReportDownloadButton
                    href={`${HREF}/download${applicationsQuery({ ...DEFAULT_APP_FILTERS, students: [s.id] }, { format: "pdf" })}`}
                    format="pdf"
                    compact
                    fallbackName="Applications-logins"
                    title={`Download ${s.name}'s applications and logins (PDF)`}
                  />
                </td>
              </tr>
            ))}
            {report.students.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {GROUPS.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[g] }} />
            {GROUP_LABELS[g]}
          </span>
        ))}
        <span>Statuses are the Applications table&rsquo;s; open a student&rsquo;s count to see each application and its login.</span>
      </div>
    </div>
  );
}
