import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { scholarshipBodyWorkbook } from "@/lib/scholarshipBodyWorkbook";
import { EXAMPLE_BODY_ROW, TEMPLATE_GUIDE_PAIRS } from "@/lib/scholarshipBodySheet";

/**
 * The blank scholarship bodies template: every column a body has, the guide
 * as twelve title/text pairs, one greyed-out example row, a How to fill sheet
 * and the destinations to copy country names from.
 *
 * For editing bodies already on file, /api/export/scholarship-bodies is the
 * better start: the same sheet with the directory in it, so the names match
 * exactly and every cell left alone changes nothing. This one is for adding
 * bodies from nothing.
 */
export async function GET() {
  // Staff only. Nothing here is secret, but it is internal reference data and
  // there is no reason to serve it openly.
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const { data: destinations } = await supabase.from("destinations").select("display_name").order("display_name");

  const { sheets, options, finish } = scholarshipBodyWorkbook([EXAMPLE_BODY_ROW], {
    italic: true,
    destinations: (destinations ?? []).map((d) => d.display_name as string),
    guidePairs: TEMPLATE_GUIDE_PAIRS,
  });
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="scholarship-bodies-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
