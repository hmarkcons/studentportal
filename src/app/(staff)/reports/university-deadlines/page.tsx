import { requireReportAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadCountryUniversities, loadDeadlineCountries, loadDeadlinesInput, loadUniversityProgrammeOptions } from "@/lib/reports/universityDeadlinesLoad";
import { buildDeadlinesReport, parseDeadlinesFilters } from "@/lib/reports/universityDeadlinesReport";
import { DeadlinesReportPanel } from "@/components/reports/DeadlinesReportPanel";
import { TableReportView } from "@/components/reports/TableReportView";
import { Card } from "@/components/ui/Card";

/** A country's universities and their programmes' deadlines. Super Admin and Processing. */
export default async function UniversityDeadlinesReportPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, staff } = await requireReportAccess("/reports/university-deadlines");
  const filters = parseDeadlinesFilters(await props.searchParams);
  const today = karachiToday();
  const [countries, universities, programmes, input] = await Promise.all([
    loadDeadlineCountries(supabase),
    loadCountryUniversities(supabase, filters.country),
    loadUniversityProgrammeOptions(supabase, filters.university),
    loadDeadlinesInput(supabase, filters),
  ]);
  const report = buildDeadlinesReport(input, filters, { preparedOn: day(today) ?? today, preparedBy: staff?.full_name ?? null, today });

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Universities and deadlines</h2>
        <p className="text-sm text-muted">
          A country&rsquo;s universities — every one, or one — and their programmes&rsquo; deadlines, by level and field. Download it as PDF or Excel.
        </p>
      </div>
      <Card>
        <DeadlinesReportPanel
          countries={countries}
          initial={filters}
          universities={universities.map((u) => ({ value: u.id, label: u.city ? `${u.name} · ${u.city}` : u.name }))}
          programmes={programmes}
          onReportPage
        />
      </Card>
      <TableReportView report={report} />
    </div>
  );
}
