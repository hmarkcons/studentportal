import { reportDownloadAccess } from "@/lib/auth/reportAccess";
import { karachiToday } from "@/lib/calendarDates";
import { day } from "@/lib/studentReport";
import { loadAppReportInput, loadRegisteredStudents } from "@/lib/reports/applicationsStatusLoad";
import { APP_FILTER_LABELS, buildAppReport, parseAppFilters } from "@/lib/reports/applicationsStatusReport";
import { refuse, tableReportResponse } from "@/lib/reports/tableReportResponse";

export const maxDuration = 60;

/** The applications report as a file, gated as its page is (Super Admin and Processing). */
export async function GET(request: Request) {
  const { supabase, staff, refusal } = await reportDownloadAccess("/reports/applications-status");
  if (refusal) return refuse(refusal.status, refusal.message);
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "pdf" ? "pdf" : null;
  if (!format) return refuse(400, "Ask for format=pdf or format=xlsx.");
  const filters = parseAppFilters(params);
  const today = karachiToday();
  const [students, input] = await Promise.all([loadRegisteredStudents(supabase), loadAppReportInput(supabase, filters.student)]);
  const chosen = students.find((s) => s.id === filters.student);
  const studentLabel = chosen ? (chosen.code ? `${chosen.name} · ${chosen.code}` : chosen.name) : null;
  const report = buildAppReport(input, filters, { preparedOn: day(today) ?? today, preparedBy: staff?.full_name ?? null, studentLabel });
  const detail = [chosen?.name, filters.category === "all" ? null : APP_FILTER_LABELS[filters.category]].filter(Boolean).join(" - ") || null;
  return tableReportResponse(report, format, today, detail);
}
