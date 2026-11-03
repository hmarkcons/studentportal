import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole, staffRoles } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";
import { visibleReports } from "@/lib/reportsCatalogue";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ReportDownloadButton } from "@/components/reports/ReportDownloadButton";
import { loadDocumentChecklist } from "@/lib/documentChecklistLoad";
import { loadApplicationsReport } from "@/lib/applicationsReportLoad";
import { CHECKLIST_STATE_COLORS, CHECKLIST_STATE_LABELS, DEFAULT_FILTERS, checklistQuery } from "@/lib/documentChecklistReport";
import { DEFAULT_APP_FILTERS, GROUPS, GROUP_COLORS, GROUP_LABELS, applicationsQuery } from "@/lib/applicationsReport";

const CHECKLIST = "/reports/documents-checklist";
const APPLICATIONS = "/reports/applications-logins";

/** A bar of coloured parts, each as long as its share. */
function Bar({ parts }: { parts: { color: string; n: number; label: string }[] }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg" aria-hidden>
      {parts
        .filter((p) => p.n > 0)
        .map((p) => (
          <div key={p.label} style={{ flexGrow: p.n, flexBasis: 0, backgroundColor: p.color }} />
        ))}
    </div>
  );
}

function Downloads({ href, name, fallbackName }: { href: (format: "pdf" | "xlsx") => string; name: string; fallbackName: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2">
      <ReportDownloadButton href={href("pdf")} format="pdf" fallbackName={fallbackName} title={`${name} (PDF)`} />
      <ReportDownloadButton href={href("xlsx")} format="xlsx" fallbackName={fallbackName} title={`${name} (Excel)`} />
    </div>
  );
}

/**
 * The Reports section of a registered student's dashboard: their documents
 * checklist and their applications & portal logins, each at a glance with its
 * PDF and Excel — the same files Reports makes, for this student alone.
 *
 * Shown only to someone holding student.reports.view (0348: Processing and
 * Super Admin to begin with; a Super Admin can give it to any role), which
 * the downloads accept for one student's file too. Read through the viewer's
 * own session, the student's rows alone, and streamed so the dashboard does
 * not wait for it.
 */
export async function StudentReportsSection({ studentId, className = "" }: { studentId: string; className?: string }) {
  const { supabase, staff } = await getStaffSession();
  const [perms, checklist, applications] = await Promise.all([
    getEffectivePermissions(),
    loadDocumentChecklist(supabase, { ...DEFAULT_FILTERS, students: [studentId] }, undefined, { onlyChosen: true }),
    loadApplicationsReport(supabase, { ...DEFAULT_APP_FILTERS, students: [studentId] }, undefined, { onlyChosen: true }),
  ]);
  const doc = checklist.report.students[0] ?? null;
  const apps = applications.report.students[0] ?? null;
  // The whole report is linked only for someone who may open it.
  const reportsOpen = canOpenPath("/reports", perms, hasRole(staff, "super_admin"));
  const opens = (href: string) => reportsOpen && visibleReports(staffRoles(staff)).some((r) => r.href === href);

  const one = { students: [studentId] };
  const checklistHref = (format: "pdf" | "xlsx") => `${CHECKLIST}/download${checklistQuery({ ...DEFAULT_FILTERS, ...one }, { format })}`;
  const applicationsHref = (format: "pdf" | "xlsx") => `${APPLICATIONS}/download${applicationsQuery({ ...DEFAULT_APP_FILTERS, ...one }, { format })}`;

  const badge = [
    doc && doc.percent !== null ? `Documents ${doc.percent}%` : null,
    apps ? `${apps.counts.total} application${apps.counts.total === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CollapsibleCard id="reports" title="Reports" subtitle="This student's documents checklist and applications, to download" badge={badge ? <span className="text-xs text-muted">{badge}</span> : undefined} className={className}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-student-reports>
        <section className="rounded-lg border border-border p-4" data-student-report="documents-checklist">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">Documents checklist</h4>
            {opens(CHECKLIST) && (
              <Link prefetch={false} href={`${CHECKLIST}${checklistQuery({ ...DEFAULT_FILTERS, ...one })}`} className="text-xs text-primary hover:underline">
                Open in Reports →
              </Link>
            )}
          </div>
          {!doc || doc.counts.total === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing is on this student&rsquo;s checklist yet.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">{doc.counts.approved}</span> of {doc.counts.total} approved
                <span className="text-muted"> · {doc.percent}%</span>
              </p>
              <div className="mt-2">
                <Bar
                  parts={[
                    { color: CHECKLIST_STATE_COLORS.approved, n: doc.counts.approved, label: "approved" },
                    { color: CHECKLIST_STATE_COLORS.review, n: doc.counts.review, label: "review" },
                    { color: CHECKLIST_STATE_COLORS.missing, n: doc.counts.missing, label: "missing" },
                    { color: CHECKLIST_STATE_COLORS.sent_back, n: doc.counts.sentBack, label: "sent_back" },
                  ]}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium text-danger">{doc.counts.left} left to do</span> ({doc.counts.missing} {CHECKLIST_STATE_LABELS.missing.toLowerCase()},{" "}
                {doc.counts.sentBack} {CHECKLIST_STATE_LABELS.sent_back.toLowerCase()}) · {doc.counts.review} {CHECKLIST_STATE_LABELS.review.toLowerCase()}
              </p>
            </>
          )}
          <Downloads href={checklistHref} name="This student's documents checklist" fallbackName="Documents-checklist" />
        </section>

        <section className="rounded-lg border border-border p-4" data-student-report="applications-logins">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">Applications &amp; portal logins</h4>
            {opens(APPLICATIONS) && (
              <Link prefetch={false} href={`${APPLICATIONS}${applicationsQuery({ ...DEFAULT_APP_FILTERS, ...one })}`} className="text-xs text-primary hover:underline">
                Open in Reports →
              </Link>
            )}
          </div>
          {!apps || apps.counts.total === 0 ? (
            <p className="mt-2 text-sm text-muted">No application has been made for this student yet.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">{apps.counts.total}</span> application{apps.counts.total === 1 ? "" : "s"}
                <span className="text-muted">
                  {" "}
                  · {apps.counts.withLogin} with a login saved
                </span>
              </p>
              <div className="mt-2">
                <Bar parts={GROUPS.map((g) => ({ color: GROUP_COLORS[g], n: apps.counts[g], label: g }))} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                {GROUPS.map((g) => (
                  <span key={g} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[g] }} />
                    {GROUP_LABELS[g]} {apps.counts[g]}
                  </span>
                ))}
              </p>
            </>
          )}
          {applications.loginsError && <p className="mt-2 text-xs text-danger">The logins could not be read: {applications.loginsError}</p>}
          <Downloads href={applicationsHref} name="This student's applications & portal logins" fallbackName="Applications-logins" />
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-danger">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            Contains passwords — keep it inside the office.
          </p>
        </section>
      </div>
    </CollapsibleCard>
  );
}
