import "server-only";
import { createElement } from "react";
import writeXlsxFile from "write-excel-file/node";
import { XLSX } from "@/lib/leadWorkbook";
import { reportFileName, tableReportSheet, type TableReport } from "./tableReport";

/** A table report's download: ?format=pdf or ?format=xlsx, named for the report and what was chosen. */
export async function tableReportResponse(report: TableReport, format: "pdf" | "xlsx", today: string, detail?: string | null): Promise<Response> {
  const headers = (type: string, length: number) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${reportFileName(report.title, today, format, detail)}"`,
    "Content-Length": String(length),
    "Cache-Control": "no-store",
  });
  if (format === "pdf") {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { TableReportDocument } = await import("@/lib/pdf/TableReportDocument");
    const element = createElement(TableReportDocument, { report });
    const pdf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
    return new Response(new Uint8Array(pdf), { headers: headers("application/pdf", pdf.length) });
  }
  const buffer = await writeXlsxFile([tableReportSheet(report)] as never, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: headers(XLSX, buffer.length) });
}

export const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
