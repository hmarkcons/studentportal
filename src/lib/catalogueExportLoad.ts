// What Setup › Universities exports, read once for both downloads: the
// universities sheet and the catalogue workbook.
//
// Each export runs the same search the page ran (universitySearch.ts) on the
// same parameters, so a download holds what was on screen and nothing else.
// Reads page and chunk (catalogueReads.ts): PostgREST stops at 1000 rows
// without a word, and a truncated export looks complete.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll, readAllIn } from "@/lib/catalogueReads";
import { searchCatalogue, type CatalogueFilters, type CatalogueMatch } from "@/lib/universitySearch";
import type { ExportProgram, ExportUniversity } from "@/lib/catalogueSheet";

export type LoadedUniversity = Omit<ExportUniversity, "dsu_body" | "destination"> & {
  id: string;
  destination_id: string;
  dsu_body_id: string | null;
  /** The destination's display name. */
  destination: string;
  /** The body's name, which is what the sheet carries. */
  dsu_body: string | null;
};
export type LoadedProgramme = ExportProgram & { id: string; university_id: string; fields: string };

const UNIVERSITY_COLUMNS =
  "id, destination_id, name, short_name, city, region, type, levels_offered, fields_offered, contact_email, " +
  "application_fee, application_fee_currency, dsu_body_id";
const PROGRAMME_COLUMNS =
  "id, university_id, level, name, core_field, sub_field, tuition_fee, duration, language_requirement, " +
  "intake_dates, interview_required, interview_details, admission_test_required, admission_test_type, " +
  "application_portal_name, application_portal_link, page_link, application_fee, application_fee_currency, " +
  "coordinator_email";

export type CatalogueSelection = {
  destinations: { id: string; display_name: string }[];
  dsuBodies: string[];
  matches: CatalogueMatch<LoadedUniversity, LoadedProgramme>[];
  /** Every programme of each matched university, whatever was searched: what a round written for "every programme" would reach. */
  programmesOf: Map<string, LoadedProgramme[]>;
};

/**
 * The universities and programmes the filters show, in the order a person
 * reads a catalogue: destination, then university name.
 *
 * `programmes` "none" skips reading them — the universities sheet does not
 * need them unless something searched or filtered by them.
 */
export async function loadCatalogueSelection(
  supabase: SupabaseClient,
  filters: CatalogueFilters,
  { programmes: wantProgrammes }: { programmes: "all" | "none" }
): Promise<CatalogueSelection> {
  const [{ data: destinationRows }, { data: bodies }] = await Promise.all([
    supabase.from("destinations").select("id, display_name, country").order("display_name"),
    supabase.from("scholarship_bodies").select("id, name").order("name"),
  ]);
  const destinations = (destinationRows ?? []) as { id: string; display_name: string; country: string | null }[];
  const destinationName = new Map(destinations.map((d) => [d.id, d.display_name]));
  const bodyName = new Map((bodies ?? []).map((b) => [b.id as string, b.name as string]));

  const scope = filters.destination ? destinations.filter((d) => d.id === filters.destination) : destinations;
  const universitiesRead = await readAllIn(
    scope.map((d) => d.id),
    (chunk, from, to) =>
      supabase
        .from("universities")
        .select(UNIVERSITY_COLUMNS)
        .in("destination_id", chunk)
        .order("id")
        .range(from, to)
        .returns<Omit<LoadedUniversity, "destination" | "dsu_body">[]>()
  );
  const universities: LoadedUniversity[] = universitiesRead
    .map((u) => ({
      ...u,
      destination: destinationName.get(u.destination_id) ?? "",
      dsu_body: u.dsu_body_id ? (bodyName.get(u.dsu_body_id) ?? null) : null,
    }))
    .sort((a, b) => a.destination.localeCompare(b.destination) || a.name.localeCompare(b.name));

  const needProgrammes = wantProgrammes === "all" || Boolean(filters.q?.trim() || filters.level);
  const programmes: LoadedProgramme[] = needProgrammes
    ? (
        await readAllIn(
          universities.map((u) => u.id),
          (chunk, from, to) =>
            supabase
              .from("programs")
              .select(PROGRAMME_COLUMNS)
              .in("university_id", chunk)
              .order("id")
              .range(from, to)
              .returns<(ExportProgram & { id: string; university_id: string })[]>()
        )
      ).map((p) => ({ ...p, fields: [p.core_field, p.sub_field].filter(Boolean).join(" / ") }))
    : [];

  const destinationText = new Map(destinations.map((d) => [d.id, `${d.display_name} ${d.country ?? ""}`]));
  const matches = searchCatalogue(universities, programmes, filters, destinationText);

  const programmesOf = new Map<string, LoadedProgramme[]>();
  for (const p of programmes) programmesOf.set(p.university_id, [...(programmesOf.get(p.university_id) ?? []), p]);

  return {
    destinations: destinations.map((d) => ({ id: d.id, display_name: d.display_name })),
    dsuBodies: (bodies ?? []).map((b) => b.name as string),
    matches,
    programmesOf,
  };
}

/** Every programme on file, a page at a time — for a search across them. */
export async function readProgrammeIndex(supabase: SupabaseClient) {
  return readAll((from, to) =>
    supabase
      .from("programs")
      .select("university_id, name, level, core_field, sub_field")
      .order("id")
      .range(from, to)
      .returns<{ university_id: string; name: string; level: string; core_field: string | null; sub_field: string | null }[]>()
  );
}

/**
 * The file's name says what is in it, so three downloads are still tellable
 * apart: catalogue-italy-public-masters-computer-science.xlsx.
 */
export function exportFileName(kind: "catalogue" | "universities", filters: CatalogueFilters, destinationLabel: string | null): string {
  const parts = [kind, destinationLabel ?? "all-destinations", filters.type, filters.level, filters.q?.trim()].filter(Boolean) as string[];
  const slug = parts
    .join("-")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return `${slug || kind}.xlsx`;
}
