import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { readAll } from "@/lib/catalogueReads";
import { scholarshipBodyWorkbook } from "@/lib/scholarshipBodyWorkbook";
import { bodySheetRow, guidePairsFor, type ExportBody } from "@/lib/scholarshipBodySheet";
import { normalizeGuide, STORED_BODY_COLUMNS, type StoredBody } from "@/lib/scholarshipBodyRows";

/**
 * Every scholarship body as it stands, in the shape the import reads.
 *
 * The other half of the import: editing the directory through a sheet only
 * works if the directory can be got INTO a sheet, with the names spelt to the
 * character so that every edited row is an update rather than a guess. And
 * re-importing an untouched export must change nothing at all — asserted in
 * scripts/scholarship-body-rows-test.mjs and by check:scholarshipimport.
 *
 * Countries are written by destination display name, for every destination a
 * body is linked to — paused ones included, since a body keeps serving a
 * country that has stopped taking new students, and an export that left it
 * out would take it away on the way back in.
 */
export async function GET() {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  // Paged, because PostgREST stops at 1000 rows without a word, and a
  // truncated export would re-import as a clean no-op over whatever it lost.
  let bodies: Omit<StoredBody, "destinationIds">[];
  let links: { scholarship_body_id: string; destination_id: string }[];
  try {
    [bodies, links] = await Promise.all([
      readAll((from, to) =>
        supabase
          .from("scholarship_bodies")
          .select(STORED_BODY_COLUMNS)
          .order("id")
          .range(from, to)
          .returns<Omit<StoredBody, "destinationIds">[]>()
      ),
      readAll((from, to) =>
        supabase
          .from("scholarship_body_destinations")
          .select("scholarship_body_id, destination_id")
          .order("scholarship_body_id")
          .order("destination_id")
          .range(from, to)
          .returns<{ scholarship_body_id: string; destination_id: string }[]>()
      ),
    ]);
  } catch (error) {
    return new Response(`Could not read the scholarship bodies: ${(error as Error).message}`, { status: 500 });
  }

  const { data: destinations } = await supabase
    .from("destinations")
    .select("id, display_name")
    .order("display_name")
    .returns<{ id: string; display_name: string }[]>();
  const destinationName = new Map((destinations ?? []).map((d) => [d.id, d.display_name]));

  const countriesOf = new Map<string, string[]>();
  for (const link of links) {
    const name = destinationName.get(link.destination_id);
    if (name) countriesOf.set(link.scholarship_body_id, [...(countriesOf.get(link.scholarship_body_id) ?? []), name]);
  }

  const exportBodies: ExportBody[] = bodies
    .map((b) => ({ ...b, countries: countriesOf.get(b.id) ?? [], guide_sections: normalizeGuide(b.guide_sections) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const guidePairs = guidePairsFor(exportBodies.map((b) => b.guide_sections?.length ?? 0));
  const { sheets, options, finish } = scholarshipBodyWorkbook(
    exportBodies.map((b) => bodySheetRow(b, guidePairs)),
    { destinations: (destinations ?? []).map((d) => d.display_name), guidePairs }
  );
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="scholarship-bodies.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
