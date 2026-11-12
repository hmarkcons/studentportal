import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { allRecipients } from "@/lib/emailCampaigns/reportData";
import { exportFileName, karachiStamp, recipientExportRow, recipientFilter, RECIPIENT_EXPORT_HEADER, toCsv } from "@/lib/emailCampaigns/reportRules";
import { XLSX } from "@/lib/leadWorkbook";
import { getSiteUrl } from "@/lib/siteUrl";
import { logEmailActivity } from "@/lib/emailCampaigns/activity";

// Fifty thousand recipients read a thousand at a time.
export const maxDuration = 60;

const refuse = (status: number, message: string) => new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * A campaign's recipients as a file — ?format=csv or xlsx, with the report's
 * filter (and search) — read as the caller, so only email.reports.view gets rows.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const { supabase } = await getStaffSession();
  if (!(await hasPermission("email.reports.view"))) return refuse(403, "Only someone allowed to see email reports can export them.");
  const format = params.get("format") === "xlsx" ? "xlsx" : params.get("format") === "csv" ? "csv" : null;
  if (!format) return refuse(400, "Ask for format=csv or format=xlsx.");
  const filter = recipientFilter(params.get("filter"));
  const search = (params.get("q") ?? "").trim().toLowerCase();

  const { data: c } = await supabase.from("email_campaigns").select("slug").eq("id", id).maybeSingle();
  if (!c) return refuse(404, "That campaign no longer exists.");
  let rows;
  try {
    rows = await allRecipients(supabase, id, filter);
  } catch (e) {
    return refuse(500, e instanceof Error ? e.message : "The recipients could not be read.");
  }
  if (search) rows = rows.filter((r) => r.email.includes(search));
  rows.sort((a, b) => a.email.localeCompare(b.email));
  const site = getSiteUrl();
  const table = rows.map((r) => recipientExportRow(r, (lead) => `${site}/leads/${lead}`));
  const name = exportFileName(c.slug as string, filter, karachiStamp(new Date().toISOString()).slice(0, 10), format);
  const headers = (type: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store, private" });

  await logEmailActivity("recipients_exported", { campaignId: id, summary: `${table.length} rows, ${format.toUpperCase()}, ${filter.replace(/_/g, " ")}${search ? `, “${search}”` : ""}` });
  if (format === "csv") return new Response(toCsv([RECIPIENT_EXPORT_HEADER, ...table]), { headers: headers("text/csv; charset=utf-8") });

  const data = [
    RECIPIENT_EXPORT_HEADER.map((h) => ({ value: h, type: String, fontWeight: "bold" as const, backgroundColor: "#E0F2FE" })),
    ...table.map((r) => r.map((v) => ({ value: v || undefined, type: String }))),
  ];
  const widths = [32, 22, 20, 17, 17, 17, 9, 9, 17, 9, 9, 17, 17, 17, 17, 8, 24, 14, 10, 14, 10, 40];
  const sheets = [{ sheet: "Recipients", data, columns: widths.map((width) => ({ width })), stickyRowsCount: 1 }];
  const buffer = await writeXlsxFile(sheets as never, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
  return new Response(new Uint8Array(buffer), { headers: headers(XLSX) });
}
