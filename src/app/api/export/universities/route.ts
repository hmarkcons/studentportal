import writeXlsxFile from "write-excel-file/node";
import { catalogueExportRefusal } from "@/lib/catalogueExportAccess";
import { createClient } from "@/lib/supabase/server";
import { universitiesWorkbook } from "@/lib/catalogueWorkbook";
import { exportFileName, loadCatalogueSelection } from "@/lib/catalogueExportLoad";
import { readFilters } from "@/lib/universitySearch";
import { universitySheetRow } from "@/lib/catalogueSheet";

/**
 * Universities alone — every one, one destination's, or what a search on
 * Setup › Universities shows — as the sheet Import universities reads, one row
 * each. An untouched export imports back as no change.
 *
 * Takes the catalogue export's parameters (destination, q, type, level), so
 * the two buttons beside the search download the same universities.
 */
export async function GET(request: Request) {
  const refused = await catalogueExportRefusal();
  if (refused) return refused;

  const filters = readFilters(new URL(request.url).searchParams);
  const supabase = await createClient();
  const { destinations, dsuBodies, matches } = await loadCatalogueSelection(supabase, filters, { programmes: "none" });
  if (filters.destination && !destinations.some((d) => d.id === filters.destination)) {
    return new Response("No such destination.", { status: 404 });
  }

  const { sheets, options, finish } = universitiesWorkbook(
    matches.map((m) => universitySheetRow(m.university)),
    { destinations: destinations.map((d) => d.display_name), dsuBodies }
  );
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  const label = filters.destination ? (destinations.find((d) => d.id === filters.destination)?.display_name ?? null) : null;
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName("universities", filters, label)}"`,
      "Cache-Control": "no-store",
    },
  });
}
