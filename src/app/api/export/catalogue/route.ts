import writeXlsxFile from "write-excel-file/node";
import { catalogueExportRefusal } from "@/lib/catalogueExportAccess";
import { createClient } from "@/lib/supabase/server";
import { catalogueWorkbook } from "@/lib/catalogueWorkbook";
import { readAllIn } from "@/lib/catalogueReads";
import { exportFileName, loadCatalogueSelection } from "@/lib/catalogueExportLoad";
import { readFilters } from "@/lib/universitySearch";
import {
  catalogueRowsForUniversity,
  roundRowsForUniversity,
  compareProgrammes,
  type CatalogueRow,
  type RoundRow,
  type ExportRound,
} from "@/lib/catalogueSheet";

/**
 * The catalogue as it stands — every destination's, one destination's, or
 * what a search on Setup › Universities shows — in the shape the importer
 * reads.
 *
 * This is the other half of the import. Editing a catalogue through a sheet
 * only works if you can get the current one INTO a sheet — otherwise the names
 * have to be retyped, and a retyped "Università di Pavia" is exactly the
 * near-miss the importer holds back. Exported names match to the character, so
 * an edited export updates rather than duplicating, and the cells left alone
 * change nothing.
 *
 * Re-importing an untouched export must be a complete no-op — a search's
 * export included, which is why its rounds are written programme by programme
 * where it holds only some of a university's (roundRowsForUniversity). That
 * property is unit-tested in scripts/catalogue-sheet-test.mjs and asserted end
 * to end by check:catalogue and check:unisearch.
 *
 * Parameters, all optional: destination (an id, or "all"), q, type
 * (public/private), level (bachelors/masters/phd) — as Setup › Universities
 * puts them in its address (universitySearch.ts).
 */
export async function GET(request: Request) {
  const refused = await catalogueExportRefusal();
  if (refused) return refused;

  const filters = readFilters(new URL(request.url).searchParams);
  const supabase = await createClient();
  const { destinations, dsuBodies, matches, programmesOf } = await loadCatalogueSelection(supabase, filters, { programmes: "all" });
  if (filters.destination && !destinations.some((d) => d.id === filters.destination)) {
    return new Response("No such destination.", { status: 404 });
  }

  // Only the rounds of the programmes being exported.
  const rounds = await readAllIn(
    matches.flatMap((m) => m.programmes.map((p) => p.id)),
    (chunk, from, to) =>
      supabase
        .from("program_intake_rounds")
        .select("id, program_id, label, start_date, application_deadline, start_text, deadline_text, sort_order")
        .in("program_id", chunk)
        .order("id")
        .range(from, to)
        .returns<(ExportRound & { program_id: string })[]>()
  );
  const roundsByProgramme = new Map<string, ExportRound[]>();
  for (const round of rounds) roundsByProgramme.set(round.program_id, [...(roundsByProgramme.get(round.program_id) ?? []), round]);

  const rows: CatalogueRow[] = [];
  const roundRows: RoundRow[] = [];
  for (const { university, programmes } of matches) {
    const withRounds = [...programmes]
      .sort(compareProgrammes)
      .map((programme) => ({ program: programme, rounds: roundsByProgramme.get(programme.id) ?? [] }));
    rows.push(...catalogueRowsForUniversity(university, withRounds));
    const every = (programmesOf.get(university.id) ?? []).map((program) => ({ program }));
    roundRows.push(...roundRowsForUniversity(university.destination, university.name, withRounds, every));
  }

  const { sheets, options, finish } = catalogueWorkbook(rows, {
    roundRows,
    destinations: destinations.map((d) => d.display_name),
    dsuBodies,
  });
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  const label = filters.destination ? (destinations.find((d) => d.id === filters.destination)?.display_name ?? null) : null;
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName("catalogue", filters, label)}"`,
      "Cache-Control": "no-store",
    },
  });
}
