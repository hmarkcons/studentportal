import { createElement } from "react";
import type { ChecklistPdfData } from "@/lib/pdf/DocumentsChecklistDocument";

/** The documents checklist report as PDF bytes. */
export async function renderDocumentsChecklist(data: ChecklistPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { DocumentsChecklistDocument } = await import("@/lib/pdf/DocumentsChecklistDocument");
  // The document's root is a <Document>; renderToBuffer's type cannot see
  // through the component to check that, as with the status report.
  const element = createElement(DocumentsChecklistDocument, { data });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
