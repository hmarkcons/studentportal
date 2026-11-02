import { createElement } from "react";
import type { ApplicationsPdfData } from "@/lib/pdf/ApplicationsReportDocument";

/** Applications & portal logins as PDF bytes. */
export async function renderApplicationsReport(data: ApplicationsPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ApplicationsReportDocument } = await import("@/lib/pdf/ApplicationsReportDocument");
  // The document's root is a <Document>; renderToBuffer's type cannot see
  // through the component to check that, as with the status report.
  const element = createElement(ApplicationsReportDocument, { data });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
