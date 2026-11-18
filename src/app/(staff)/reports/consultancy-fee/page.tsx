import { requireReportAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadFeeStandings } from "@/lib/reports/consultancyFeeLoad";
import { FEE_FILTER_LABELS, buildFeeReport, parseFeeFilters, type FeeFilter } from "@/lib/reports/consultancyFeeReport";
import { ReportFilterPanel } from "@/components/reports/ReportFilterPanel";
import { TableReportView } from "@/components/reports/TableReportView";
import { Card } from "@/components/ui/Card";

const HREF = "/reports/consultancy-fee";

/** The consultancy fee report: Paid in full, Pending fee, Payment overdue, Withdrawn. Super Admin and Finance. */
export default async function ConsultancyFeeReportPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, staff } = await requireReportAccess("/reports/consultancy-fee");
  const filters = parseFeeFilters(await props.searchParams);
  const today = karachiToday();
  const report = buildFeeReport(await loadFeeStandings(supabase, today), filters, { preparedOn: day(today) ?? today, preparedBy: staff?.full_name ?? null });

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Consultancy fee report</h2>
        <p className="text-sm text-muted">Every registered student&rsquo;s consultancy fee, by how its payment stands. Download it as PDF or Excel.</p>
      </div>
      <Card>
        <ReportFilterPanel
          id="consultancy-fee"
          reportHref={HREF}
          downloadHref={`${HREF}/download`}
          onReportPage
          selects={[
            {
              name: "category",
              label: "Payment",
              value: filters.category,
              options: (Object.keys(FEE_FILTER_LABELS) as FeeFilter[]).map((k) => ({ value: k === "all" ? "" : k, label: FEE_FILTER_LABELS[k] })),
            },
          ]}
        />
      </Card>
      <TableReportView report={report} />
    </div>
  );
}
