import { reportDownloadAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadFeeStandings } from "@/lib/reports/consultancyFeeLoad";
import { FEE_FILTER_LABELS, buildFeeReport, parseFeeFilters } from "@/lib/reports/consultancyFeeReport";
import { refuse, tableReportResponse } from "@/lib/reports/tableReportResponse";

export const maxDuration = 60;

/** The consultancy fee report as a file, gated as its page is (Super Admin and Finance). */
export async function GET(request: Request) {
  const { supabase, staff, refusal } = await reportDownloadAccess("/reports/consultancy-fee");
  if (refusal) return refuse(refusal.status, refusal.message);
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "pdf" ? "pdf" : null;
  if (!format) return refuse(400, "Ask for format=pdf or format=xlsx.");
  const filters = parseFeeFilters(params);
  const today = karachiToday();
  const report = buildFeeReport(await loadFeeStandings(supabase, today), filters, { preparedOn: day(today) ?? today, preparedBy: staff?.full_name ?? null });
  return tableReportResponse(report, format, today, filters.category === "all" ? null : FEE_FILTER_LABELS[filters.category]);
}
