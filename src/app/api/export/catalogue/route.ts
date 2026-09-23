import writeXlsxFile from "write-excel-file/node";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { catalogueWorkbook } from "@/lib/catalogueWorkbook";
import {
  catalogueRowsForUniversity,
  compareProgrammes,
  type CatalogueRow,
  type ExportProgram,
  type ExportRound,
  type ExportUniversity,
} from "@/lib/catalogueSheet";

/**
 * A destination's catalogue as it stands, in the shape the importer reads.
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

/**
 * PostgREST stops at 1000 rows and says nothing about it, so every read here
 * pages. Germany alone is past that, and a silently truncated export would
 * look like a complete one — and then reimporting it would look like a clean
 * no-op while half the catalogue was never in the file.
 */
async function readAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await run(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function GET(request: Request) {
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });

  const destinationId = new URL(request.url).searchParams.get("destination");
  if (!destinationId) return new Response("Choose a destination first.", { status: 400 });

  const supabase = await createClient();
  const { data: destination } = await supabase
    .from("destinations")
    .select("id, display_name")
    .eq("id", destinationId)
    .maybeSingle();
  if (!destination) return new Response("No such destination.", { status: 404 });

  const universities = await readAll<ExportUniversity & { id: string }>((from, to) =>
    supabase
      .from("universities")
      .select("id, name, city, region, type, levels_offered, fields_offered, contact_email")
      .eq("destination_id", destinationId)
      .order("name")
      .range(from, to)
      .returns<(ExportUniversity & { id: string })[]>()
  );

  const universityIds = universities.map((u) => u.id);
  const programmes = universityIds.length
    ? await readAll<ExportProgram & { id: string; university_id: string }>((from, to) =>
        supabase
          .from("programs")
          .select(
            "id, university_id, level, name, core_field, sub_field, tuition_fee, duration, language_requirement, " +
              "intake_dates, interview_required, interview_details, admission_test_required, admission_test_type, " +
              "application_portal_name, application_portal_link, page_link"
          )
          .in("university_id", universityIds)
          .range(from, to)
          .returns<(ExportProgram & { id: string; university_id: string })[]>()
      )
    : [];

  const programmeIds = programmes.map((p) => p.id);
  const rounds = programmeIds.length
    ? await readAll<ExportRound & { program_id: string }>((from, to) =>
        supabase
          .from("program_intake_rounds")
          .select("program_id, label, start_date, application_deadline, sort_order")
          .in("program_id", programmeIds)
          .range(from, to)
          .returns<(ExportRound & { program_id: string })[]>()
      )
    : [];

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

  const rows: CatalogueRow[] = [];
  for (const university of universities) {
    const own = (programmesByUniversity.get(university.id) ?? []).sort(compareProgrammes);
    rows.push(
      ...catalogueRowsForUniversity(
        university,
        own.map((programme) => ({ program: programme, rounds: roundsByProgramme.get(programme.id) ?? [] }))
      )
    );
  }

  const { sheets, options, finish } = catalogueWorkbook(rows);
  const buffer = finish(await writeXlsxFile(sheets, options).toBuffer());

  // The destination in the filename, so three of these in a downloads folder
  // are still tellable apart.
  const slug = destination.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalogue-${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
