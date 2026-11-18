import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/catalogueReads";
import type { DeadlineProgramme, DeadlineUniversity, DeadlinesFilters } from "./universityDeadlinesReport";

export type DeadlineOption = { value: string; label: string };

/** The countries (destinations) to choose from, by name. */
export async function loadDeadlineCountries(supabase: SupabaseClient): Promise<DeadlineOption[]> {
  const { data } = await supabase.from("destinations").select("id, display_name").order("display_name");
  return (data ?? []).map((d) => ({ value: d.id as string, label: (d.display_name as string | null) ?? "Unnamed country" }));
}

/** A country's active universities, by name. */
export async function loadCountryUniversities(supabase: SupabaseClient, country: string): Promise<DeadlineUniversity[]> {
  if (!country) return [];
  const { data } = await supabase.from("universities").select("id, name, city, type").eq("destination_id", country).eq("status", "active").order("name");
  return (data ?? []).map((u) => ({ id: u.id as string, name: u.name as string, city: (u.city as string | null) ?? null, type: (u.type as string | null) ?? null }));
}

type Raw = {
  id: string;
  university_id: string;
  name: string;
  level: string | null;
  field_group: string | null;
  core_field: string | null;
  rounds: { label: string | null; start_date: string | null; application_deadline: string | null; start_text: string | null; deadline_text: string | null; sort_order: number | null }[] | null;
};

/** What the report is made from: the country, its universities, and their programmes with every round. */
export async function loadDeadlinesInput(supabase: SupabaseClient, filters: DeadlinesFilters) {
  if (!filters.country) return { countryName: null, universities: [] as DeadlineUniversity[], programmes: [] as DeadlineProgramme[] };
  const [{ data: country }, universities] = await Promise.all([
    supabase.from("destinations").select("display_name").eq("id", filters.country).maybeSingle(),
    loadCountryUniversities(supabase, filters.country),
  ]);
  const ids = (filters.university ? universities.filter((u) => u.id.toLowerCase() === filters.university) : universities).map((u) => u.id);
  const raw: Raw[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    raw.push(
      ...(await readAll<Raw>((from, to) =>
        supabase
          .from("programs")
          .select("id, university_id, name, level, field_group, core_field, rounds:program_intake_rounds(label, start_date, application_deadline, start_text, deadline_text, sort_order)")
          .in("university_id", chunk)
          .order("name")
          .order("id")
          .range(from, to)
          .returns<Raw[]>()
      ))
    );
  }
  const programmes: DeadlineProgramme[] = raw.map((p) => ({
    id: p.id,
    universityId: p.university_id,
    name: p.name,
    level: p.level,
    fieldGroup: p.field_group,
    coreField: p.core_field,
    rounds: (p.rounds ?? []).map((r) => ({
      label: r.label,
      startDate: r.start_date,
      deadline: r.application_deadline,
      startText: r.start_text,
      deadlineText: r.deadline_text,
      sortOrder: r.sort_order ?? 0,
    })),
  }));
  return { countryName: (country?.display_name as string | null) ?? null, universities, programmes };
}

/** One university's programmes, for the Programmes dropdown: "Name — Level". */
export async function loadUniversityProgrammeOptions(supabase: SupabaseClient, university: string): Promise<DeadlineOption[]> {
  if (!university) return [];
  const rows = await readAll<{ id: string; name: string; level: string | null }>((from, to) =>
    supabase.from("programs").select("id, name, level").eq("university_id", university).order("name").order("id").range(from, to).returns<{ id: string; name: string; level: string | null }[]>()
  );
  return rows.map((p) => ({ value: p.id, label: p.level ? `${p.name} — ${p.level}` : p.name }));
}
