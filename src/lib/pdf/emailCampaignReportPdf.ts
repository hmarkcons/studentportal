import { createElement } from "react";
import type { EmailCampaignPdfData } from "@/lib/pdf/EmailCampaignReportDocument";

/** An email campaign's report as PDF bytes. */
export async function renderEmailCampaignReport(data: EmailCampaignPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { EmailCampaignReportDocument } = await import("@/lib/pdf/EmailCampaignReportDocument");
  const element = createElement(EmailCampaignReportDocument, { data });
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
