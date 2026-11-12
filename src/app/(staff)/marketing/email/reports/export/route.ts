import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { campaignRows } from "@/lib/emailCampaigns/reportData";
import { CAMPAIGN_EXPORT_HEADER, campaignExportRow, campaignSort, karachiStamp, sortCampaigns, toCsv } from "@/lib/emailCampaigns/reportRules";
import { XLSX } from "@/lib/leadWorkbook";

export const maxDuration = 60;

const refuse = (status: number, message: string) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * The Reports tab's campaigns, side by side, as a file — ?format=csv or xlsx,
 * in the order the table was sorted, practice sends only when asked for. Read
 * as the caller, so only email.reports.view gets numbers.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { supabase } = await getStaffSession();
  if (!(await hasPermission("email.reports.view"))) return refuse(403, "Only someone allowed to see email reports can export them.");
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "csv" ? "csv" : null;
  if (!format) return refuse(400, "Ask for format=csv or format=xlsx.");
  const includePractice = params.get("practice") === "1";
  const rows = sortCampaigns(await campaignRows(supabase, { includePractice, limit: 500 }), campaignSort(params.get("sort")), params.get("dir") === "asc" ? "asc" : "desc");
  const table = rows.map(campaignExportRow);
  const name = `email-campaigns${includePractice ? "-with-practice" : ""}-${karachiStamp(new Date().toISOString()).slice(0, 10)}.${format}`;
  const headers = (type: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store, private" });

  if (format === "csv") return new Response(toCsv([CAMPAIGN_EXPORT_HEADER, ...table]), { headers: headers("text/csv; charset=utf-8") });

  const data = [
    CAMPAIGN_EXPORT_HEADER.map((h) => ({ value: h, type: String, fontWeight: "bold" as const, backgroundColor: "#E0F2FE" })),
    ...table.map((r) => r.map((v, i) => (i >= 3 && i !== 6 && i !== 8 && i !== 12 && v !== "" ? { value: Number(v), type: Number } : { value: v || undefined, type: String }))),
  ];
  const widths = [40, 9, 17, 9, 10, 15, 10, 15, 10, 18, 11, 9, 10, 13, 15];
  const sheets = [{ sheet: "Campaigns", data, columns: widths.map((width) => ({ width })), stickyRowsCount: 1 }];
  const buffer = await writeXlsxFile(sheets as never, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: headers(XLSX) });
}
