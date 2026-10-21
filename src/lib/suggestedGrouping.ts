// Suggested programmes (suggested_programs RPC) grouped for the Applications
// tab: one section per country the student is registered for, and inside each,
// its universities with their matching programmes. Pure, so the unit tests
// read it directly (scripts/suggested-grouping-test.mjs).

export type SuggestedProgramme = {
  program_id: string;
  program_name: string;
  level: string;
  core_field: string | null;
  field_group_name: string;
  university_id: string;
  university_name: string;
  /** The destination's display name, e.g. "Italy (Public)". */
  destination_name: string;
  is_backup: boolean;
  /** True when it matched a field the student named specifically, not just a broad area. */
  matched_specific: boolean;
};

export type SuggestedUniversity = {
  id: string;
  name: string;
  programmes: SuggestedProgramme[];
};

export type SuggestedCountry = {
  /** The destination's display name. */
  name: string;
  isBackup: boolean;
  /** How many programmes are suggested here, across its universities. */
  count: number;
  universities: SuggestedUniversity[];
};

/** A registered destination, in the order the page wants countries shown (primary first, then backups). */
export type RegisteredCountry = { name: string; isBackup: boolean };

/**
 * Programmes grouped into country → university → programmes.
 *
 * Every country the student is registered for gets a section, in the order
 * given — including one with no matches, so the panel can say a country was
 * considered rather than silently dropping it. A university appears under a
 * country only when it has a matching programme; universities read
 * alphabetically, and within each, the programmes the student asked for
 * specifically come before broader matches, then by name.
 *
 * A suggestion whose destination is not in the registered list (an edge the
 * RPC should not produce, since it joins the student's own destinations) is
 * still shown, in its own section after the registered ones, so nothing is
 * quietly lost.
 */
export function groupSuggestedProgrammes(
  suggestions: readonly SuggestedProgramme[],
  registered: readonly RegisteredCountry[]
): SuggestedCountry[] {
  const byCountry = new Map<string, SuggestedProgramme[]>();
  for (const s of suggestions) {
    byCountry.set(s.destination_name, [...(byCountry.get(s.destination_name) ?? []), s]);
  }

  const build = (name: string, isBackup: boolean): SuggestedCountry => {
    const rows = byCountry.get(name) ?? [];
    const byUniversity = new Map<string, SuggestedProgramme[]>();
    for (const r of rows) byUniversity.set(r.university_id, [...(byUniversity.get(r.university_id) ?? []), r]);
    const universities = [...byUniversity.values()]
      .map((programmes) => ({
        id: programmes[0].university_id,
        name: programmes[0].university_name,
        programmes: [...programmes].sort(
          (a, b) => Number(b.matched_specific) - Number(a.matched_specific) || a.program_name.localeCompare(b.program_name)
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { name, isBackup, count: rows.length, universities };
  };

  const seen = new Set<string>();
  const out: SuggestedCountry[] = [];
  for (const c of registered) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(build(c.name, c.isBackup));
  }
  // Any suggestions for a country not on the registered list: shown last.
  for (const name of byCountry.keys()) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(build(name, false));
  }
  return out;
}

/** Total programmes suggested across every country, for the panel's header. */
export function countSuggested(groups: readonly SuggestedCountry[]): number {
  return groups.reduce((n, c) => n + c.count, 0);
}
