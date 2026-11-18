import { requireReportAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadAppReportInput, loadRegisteredStudents } from "@/lib/reports/applicationsStatusLoad";
import { appCategoryOptions, buildAppReport, parseAppFilters, studentOption } from "@/lib/reports/applicationsStatusReport";
import { ReportFilterPanel } from "@/components/reports/ReportFilterPanel";
import { TableReportView } from "@/components/reports/TableReportView";
import { Card } from "@/components/ui/Card";

const HREF = "/reports/applications-status";

/** The applications report: submitted, pending, rejected, not eligible — one student or all. Super Admin and Processing. */
export default async function ApplicationsStatusReportPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, staff } = await requireReportAccess("/reports/applications-status");
  const filters = parseAppFilters(await props.searchParams);
  const today = karachiToday();
  const [students, input] = await Promise.all([loadRegisteredStudents(supabase), loadAppReportInput(supabase, filters.student)]);
  const chosen = students.find((s) => s.id === filters.student);
  const report = buildAppReport(input, filters, {
    preparedOn: day(today) ?? today,
    preparedBy: staff?.full_name ?? null,
    studentLabel: chosen ? studentOption(chosen).label : null,
  });

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Applications report</h2>
        <p className="text-sm text-muted">Registered students&rsquo; applications by where each stands — one student, or every one. Download it as PDF or Excel.</p>
      </div>
      <Card>
        <ReportFilterPanel
          id="applications-status"
          reportHref={HREF}
          downloadHref={`${HREF}/download`}
          onReportPage
          selects={[
            { name: "student", label: "Student", value: filters.student, options: [{ value: "", label: "All registered students" }, ...students.map(studentOption)] },
            { name: "category", label: "Applications", value: filters.category === "all" ? "" : filters.category, options: appCategoryOptions() },
          ]}
        />
      </Card>
      <TableReportView report={report} />
    </div>
  );
}
