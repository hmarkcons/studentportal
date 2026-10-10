import { createElement } from "react";
import type { StudentReportData } from "@/lib/studentReportLoad";

/** The status report as PDF bytes. */
export async function renderStudentReport(data: StudentReportData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { StudentReportDocument } = await import("@/lib/pdf/StudentReportDocument");
  // The document's root is a <Document>; renderToBuffer's type cannot see
  // through the component to check that, as with the invoice.
  const element = createElement(StudentReportDocument, { data });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
