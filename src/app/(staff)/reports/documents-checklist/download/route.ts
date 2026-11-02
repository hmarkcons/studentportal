import writeXlsxFile from "write-excel-file/node";
import { reportDownloadAccess } from "@/lib/auth/reportAccess";
import { loadDocumentChecklist } from "@/lib/documentChecklistLoad";
import { checklistFileName, describeFilters, parseChecklistFilters } from "@/lib/documentChecklistReport";
import { checklistWorkbookSheets } from "@/lib/documentChecklistWorkbook";
import { renderDocumentsChecklist } from "@/lib/pdf/documentsChecklistPdf";
import { karachiToday } from "@/lib/intakeCycle";
import { day } from "@/lib/studentReport";
import { XLSX } from "@/lib/leadWorkbook";

// Every registered student's checklist is about a hundred PDF pages; it
// renders in a few seconds, and this leaves room for a slow day.
export const maxDuration = 60;

const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * The documents checklist report as a file: ?format=pdf or ?format=xlsx, with
 * the page's own filters (officer, country, show, sort) so the download is
 * what the page was showing.
 *
 * Gated as the page is — Processing and Super Admin (REPORT_CATALOGUE) — and
 * read through the caller's own session, so row-level security decides whose
 * documents are in it.
 */
export async function GET(request: Request) {
  const { supabase, staff, refusal } = await reportDownloadAccess("/reports/documents-checklist");
  if (refusal) return refuse(refusal.status, refusal.message);

  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "pdf" ? "pdf" : null;
  if (!format) return refuse(400, "Ask for format=pdf or format=xlsx.");

  const filters = parseChecklistFilters(params);
  const today = karachiToday();
  const { report, officers, countries } = await loadDocumentChecklist(supabase, filters, today);
  const meta = {
    preparedOn: day(today) ?? today,
    preparedBy: staff?.full_name?.trim() || null,
    filters: describeFilters(
      filters,
      (id) => officers.find((o) => o.id === id)?.name ?? null,
      (id) => countries.find((c) => c.id === id)?.name ?? null
    ),
  };

  const headers = (type: string, length: number) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${checklistFileName(today, format)}"`,
    "Content-Length": String(length),
    "Cache-Control": "no-store",
  });

  if (format === "pdf") {
    const pdf = await renderDocumentsChecklist({ report, ...meta });
    return new Response(new Uint8Array(pdf), { headers: headers("application/pdf", pdf.length) });
  }

  const buffer = await writeXlsxFile(checklistWorkbookSheets(report, meta) as never, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: headers(XLSX, buffer.length) });
}
