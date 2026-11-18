import { reportDownloadAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadDeadlinesInput } from "@/lib/reports/universityDeadlinesLoad";
import { buildDeadlinesReport, parseDeadlinesFilters } from "@/lib/reports/universityDeadlinesReport";
import { refuse, tableReportResponse } from "@/lib/reports/tableReportResponse";

export const maxDuration = 60;

/** The universities and deadlines report as a file, gated as its page is (Super Admin and Processing). */
export async function GET(request: Request) {
  const { supabase, staff, refusal } = await reportDownloadAccess("/reports/university-deadlines");
  if (refusal) return refuse(refusal.status, refusal.message);
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "pdf" ? "pdf" : null;
  if (!format) return refuse(400, "Ask for format=pdf or format=xlsx.");
  const filters = parseDeadlinesFilters(params);
  if (!filters.country) return refuse(400, "Choose a country first.");
  const today = karachiToday();
  const input = await loadDeadlinesInput(supabase, filters);
  const report = buildDeadlinesReport(input, filters, { preparedOn: day(today) ?? today, preparedBy: staff?.full_name ?? null, today });
  const uni = filters.university ? input.universities.find((u) => u.id.toLowerCase() === filters.university)?.name : null;
  return tableReportResponse(report, format, today, uni ?? input.countryName);
}
