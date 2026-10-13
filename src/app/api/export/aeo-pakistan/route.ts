import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { loadAeoRecords, seesAeo } from "@/lib/aeoLoad";
import { matchesFilter, type AeoFilter, type PaymentStatus } from "@/lib/aeoCommissions";
import { aeoFileName, aeoWorkbook } from "@/lib/aeoWorkbook";
import { karachiToday } from "@/lib/calendarDates";

/**
 * The AEO Pakistan record as an Excel workbook, in the office's own layout
 * (aeoWorkbook.ts) — what the page shows, with its search and filters
 * (?q=, ?status=, ?year=), or, with ?template=1, the headers alone.
 *
 * Super Admin and Finance only, as the page is; the table's policies would
 * return nobody else a row anyway, and an empty workbook for a counsellor
 * would read as "nothing on file" rather than "not yours".
 */
export async function GET(request: Request) {
  const { supabase, staff } = await getStaffSession();
  if (!staff || !seesAeo(staff)) return new Response("Only a Super Admin or the account officer can export the AEO Pakistan record.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const template = params.get("template") === "1";
  const status = params.get("status");
  const filter: AeoFilter = {
    q: params.get("q") ?? "",
    status: status === "paid" || status === "unpaid" ? (status as PaymentStatus) : "all",
    year: params.get("year") ?? "all",
  };

  let records: Awaited<ReturnType<typeof loadAeoRecords>> = [];
  if (!template) {
    try {
      records = (await loadAeoRecords(supabase)).filter((r) => matchesFilter(r, filter));
    } catch (error) {
      return new Response(`Could not read the record: ${(error as Error).message}`, { status: 500 });
    }
  }

  const { sheets, options, finish } = aeoWorkbook(records);
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());
  const name = aeoFileName(karachiToday(), template);
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
