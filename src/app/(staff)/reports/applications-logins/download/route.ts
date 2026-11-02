import writeXlsxFile from "write-excel-file/node";
import { reportDownloadAccess } from "@/lib/auth/reportAccess";
import { loadApplicationsReport } from "@/lib/applicationsReportLoad";
import { applicationsFileName, describeApplicationsFilters, parseApplicationsFilters } from "@/lib/applicationsReport";
import { applicationsWorkbookSheets } from "@/lib/applicationsWorkbook";
import { renderApplicationsReport } from "@/lib/pdf/applicationsReportPdf";
import { karachiToday } from "@/lib/intakeCycle";
import { day } from "@/lib/studentReport";
import { XLSX } from "@/lib/leadWorkbook";

// Every registered student's applications run to a few dozen pages; this
// leaves room for a slow day.
export const maxDuration = 60;

const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Applications & portal logins as a file: ?format=pdf or ?format=xlsx, with
 * the page's own filters (students, officer, country, status, show, login),
 * so the download is what the page was showing. For one student (a row's PDF
 * button, or one picked) the file is named after them.
 *
 * It holds passwords. Gated as the page is — Processing and Super Admin
 * (REPORT_CATALOGUE), who can already Reveal each login on the student's
 * record — and read through the caller's own session, so application_logins
 * (0347) decrypts only what they may see. Never cached on the way.
 */
export async function GET(request: Request) {
  const { supabase, staff, refusal } = await reportDownloadAccess("/reports/applications-logins");
  if (refusal) return refuse(refusal.status, refusal.message);

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "pdf" ? "pdf" : null;
  if (!format) return refuse(400, "Ask for format=pdf or format=xlsx.");

  const filters = parseApplicationsFilters(params);
  const today = karachiToday();
  const { report, officers, countries, students, loginsError } = await loadApplicationsReport(supabase, filters, today);
  const meta = {
    preparedOn: day(today) ?? today,
    preparedBy: staff?.full_name?.trim() || null,
    filters: describeApplicationsFilters(
      filters,
      (id) => officers.find((o) => o.id === id)?.name ?? null,
      (id) => countries.find((c) => c.id === id)?.name ?? null,
      (id) => students.find((s) => s.id === id)?.name ?? null
    ),
    loginsError,
  };
  const only = filters.students.length === 1 && report.students.length === 1 ? report.students[0] : null;

  const headers = (type: string, length: number) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${applicationsFileName(today, format, only)}"`,
    "Content-Length": String(length),
    // Passwords: kept by no cache, shared or private.
    "Cache-Control": "no-store, private",
  });

  if (format === "pdf") {
    const pdf = await renderApplicationsReport({ report, ...meta });
    return new Response(new Uint8Array(pdf), { headers: headers("application/pdf", pdf.length) });
  }

  const buffer = await writeXlsxFile(applicationsWorkbookSheets(report, meta) as never, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: headers(XLSX, buffer.length) });
}
