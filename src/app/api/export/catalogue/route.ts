import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { catalogueWorkbook } from "@/lib/catalogueWorkbook";
import { readAllIn } from "@/lib/catalogueReads";
import {
  catalogueRowsForUniversity,
  roundRowsForUniversity,
  compareProgrammes,
  type CatalogueRow,
  type RoundRow,
  type ExportProgram,
  type ExportRound,
  type ExportUniversity,
} from "@/lib/catalogueSheet";

/**
 * A destination's catalogue as it stands — or every destination's — in the
 * shape the importer reads.
 *
 * This is the other half of the import. Editing a catalogue through a sheet
 * only works if you can get the current one INTO a sheet — otherwise the names
 * have to be retyped, and a retyped "Università di Pavia" is exactly the
 * near-miss the importer holds back. Exported names match to the character, so
 * an edited export updates rather than duplicating, and the cells left alone
 * change nothing.
 *
 * Re-importing an untouched export must be a complete no-op. That property is
 * unit-tested in scripts/catalogue-sheet-test.mjs and asserted end to end by
 * check:catalogue.
 */

export async function GET(request: Request) {
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  // "all" exports every destination into one sheet, which the importer takes
  // back whole — each row names its own destination.
  const destinationParam = new URL(request.url).searchParams.get("destination");
  if (!destinationParam) return new Response("Choose a destination first.", { status: 400 });

  const supabase = await createClient();
  const { data: allDestinations } = await supabase
    .from("destinations")
    .select("id, display_name")
    .order("display_name")
    .returns<{ id: string; display_name: string }[]>();
  const destinations =
    destinationParam === "all"
      ? (allDestinations ?? [])
      : (allDestinations ?? []).filter((d) => d.id === destinationParam);
  if (destinations.length === 0) return new Response("No such destination.", { status: 404 });
  const destinationName = new Map(destinations.map((d) => [d.id, d.display_name]));

  // Paged and chunked, because PostgREST truncates at 1000 rows without a
  // word and a long `.in()` list overruns the URL — see catalogueReads.ts.
  // Germany alone is past 1000 programmes, and a silently truncated export
  // would look complete, and then re-importing it would look like a clean
  // no-op while half the catalogue was never in the file.
  const universities = await readAllIn(
    destinations.map((d) => d.id),
    (chunk, from, to) =>
      supabase
        .from("universities")
        .select("id, destination_id, name, city, region, type, levels_offered, fields_offered, contact_email")
        .in("destination_id", chunk)
        .order("id")
        .range(from, to)
        .returns<(ExportUniversity & { id: string; destination_id: string })[]>()
  );

  const programmes = await readAllIn(
    universities.map((u) => u.id),
    (chunk, from, to) =>
      supabase
        .from("programs")
        .select(
          "id, university_id, level, name, core_field, sub_field, tuition_fee, duration, language_requirement, " +
            "intake_dates, interview_required, interview_details, admission_test_required, admission_test_type, " +
            "application_portal_name, application_portal_link, page_link"
        )
        .in("university_id", chunk)
        .order("id")
        .range(from, to)
        .returns<(ExportProgram & { id: string; university_id: string })[]>()
  );

  const rounds = await readAllIn(
    programmes.map((p) => p.id),
    (chunk, from, to) =>
      supabase
        .from("program_intake_rounds")
        .select("id, program_id, label, start_date, application_deadline, sort_order")
        .in("program_id", chunk)
        .order("id")
        .range(from, to)
        .returns<(ExportRound & { program_id: string })[]>()
  );

  const roundsByProgramme = new Map<string, ExportRound[]>();
  for (const round of rounds) {
    roundsByProgramme.set(round.program_id, [...(roundsByProgramme.get(round.program_id) ?? []), round]);
  }
  const programmesByUniversity = new Map<string, (ExportProgram & { id: string })[]>();
  for (const programme of programmes) {
    programmesByUniversity.set(programme.university_id, [
      ...(programmesByUniversity.get(programme.university_id) ?? []),
      programme,
    ]);
  }

  // Destination, then university, then level and name — the way a person
  // reads a catalogue. Read in id order for paging; sorted here.
  universities.sort(
    (a, b) =>
      (destinationName.get(a.destination_id) ?? "").localeCompare(destinationName.get(b.destination_id) ?? "") ||
      a.name.localeCompare(b.name)
  );

  const rows: CatalogueRow[] = [];
  const roundRows: RoundRow[] = [];
  for (const university of universities) {
    const destination = destinationName.get(university.destination_id) ?? "";
    const own = (programmesByUniversity.get(university.id) ?? []).sort(compareProgrammes);
    const withRounds = own.map((programme) => ({ program: programme, rounds: roundsByProgramme.get(programme.id) ?? [] }));
    rows.push(...catalogueRowsForUniversity({ ...university, destination }, withRounds));
    roundRows.push(...roundRowsForUniversity(destination, university.name, withRounds));
  }

  const { sheets, options, finish } = catalogueWorkbook(rows, {
    roundRows,
    destinations: (allDestinations ?? []).map((d) => d.display_name),
  });
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  // The destination in the filename, so three of these in a downloads folder
  // are still tellable apart.
  const label = destinationParam === "all" ? "all-destinations" : destinations[0].display_name;
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalogue-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
