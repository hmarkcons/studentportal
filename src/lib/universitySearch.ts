// Setup › Universities: which universities and programmes a search shows.
//
// One function decides it for the page and for both exports, so what is
// downloaded is what was on screen — the page runs it as the search is typed,
// the export routes run it again on the same parameters. Pure, so the unit
// tests (scripts/university-search-test.mjs) read it under plain Node.

import { levelKey } from "./catalogueText.ts";

export type SearchUniversity = {
  id: string;
  name: string;
  short_name?: string | null;
  city?: string | null;
  region?: string | null;
  type?: string | null;
  destination_id: string;
};

export type SearchProgramme = {
  university_id: string;
  name: string;
  level: string;
  /** core_field and sub_field, as one line. */
  fields?: string | null;
};

export const SEARCH_LEVELS = ["bachelors", "masters", "phd"] as const;
export type SearchLevel = (typeof SEARCH_LEVELS)[number];
export type SearchType = "public" | "private";

export type CatalogueFilters = {
  q?: string | null;
  destination?: string | null;
  type?: SearchType | null;
  level?: SearchLevel | null;
};

/** What the URL carries, read back safely: anything it does not recognise is no filter. */
export function readFilters(params: { get(name: string): string | null }): CatalogueFilters {
  const type = params.get("type");
  const level = params.get("level");
  const destination = params.get("destination");
  return {
    q: (params.get("q") ?? "").slice(0, 200) || null,
    destination: destination && destination !== "all" ? destination : null,
    type: type === "public" || type === "private" ? type : null,
    level: (SEARCH_LEVELS as readonly string[]).includes(level ?? "") ? (level as SearchLevel) : null,
  };
}

/** The same filters as a query string, in a fixed order; empty when nothing is filtered. */
export function filtersQuery(f: CatalogueFilters): string {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.destination) p.set("destination", f.destination);
  if (f.type) p.set("type", f.type);
  if (f.level) p.set("level", f.level);
  return p.toString();
}

export function isFiltered(f: CatalogueFilters): boolean {
  return Boolean(f.q?.trim() || f.destination || f.type || f.level);
}

/**
 * Text as a search compares it: no accents, no case, punctuation as spaces —
 * so "universita" finds "Università", and "St. Gallen" finds "St Gallen".
 */
export function fold(text: string | null | undefined): string {
  return ` ${(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/** The words of a search, each to be found somewhere; none for an empty one. */
export function searchWords(q: string | null | undefined): string[] {
  return fold(q).trim().split(" ").filter(Boolean);
}

export type CatalogueMatch<U extends SearchUniversity, P extends SearchProgramme> = {
  university: U;
  /**
   * The programmes it shows and exports: every one (at the level chosen) when
   * the university itself matched or nothing was searched, else only the ones
   * that matched.
   */
  programmes: P[];
  /** "university": its own name, city, region or country matched; "programmes": only some of its programmes did. */
  matchedBy: "all" | "university" | "programmes";
  /** How many programmes it has at the level chosen, matched or not. */
  programmesAtLevel: number;
};

/**
 * The universities a search shows, in the order given, each with the
 * programmes that come with it.
 *
 * Every word must be found, in the university's own name, short name, city,
 * region or country, or in a programme's name, level or fields — so "milan
 * computer" finds Politecnico di Milano's computing programmes, and not every
 * programme in Milan. A university found by its own details brings all its
 * programmes; one found only through some programmes brings just those.
 */
export function searchCatalogue<U extends SearchUniversity, P extends SearchProgramme>(
  universities: readonly U[],
  programmes: readonly P[],
  filters: CatalogueFilters,
  /** Each destination's name and country, so "italy" finds Italy's universities. */
  destinationText: ReadonlyMap<string, string> = new Map()
): CatalogueMatch<U, P>[] {
  const words = searchWords(filters.q);
  const byUniversity = new Map<string, P[]>();
  for (const p of programmes) byUniversity.set(p.university_id, [...(byUniversity.get(p.university_id) ?? []), p]);

  const out: CatalogueMatch<U, P>[] = [];
  for (const u of universities) {
    if (filters.destination && u.destination_id !== filters.destination) continue;
    if (filters.type && u.type !== filters.type) continue;
    const own = byUniversity.get(u.id) ?? [];
    const atLevel = filters.level ? own.filter((p) => levelKey(p.level) === filters.level) : own;
    // Asked for a level, a university with nothing at it is not shown at all.
    if (filters.level && atLevel.length === 0) continue;

    if (words.length === 0) {
      out.push({ university: u, programmes: atLevel, matchedBy: "all", programmesAtLevel: atLevel.length });
      continue;
    }
    const uText = fold([u.name, u.short_name, u.city, u.region, destinationText.get(u.destination_id)].filter(Boolean).join(" "));
    if (words.every((w) => uText.includes(w))) {
      out.push({ university: u, programmes: atLevel, matchedBy: "university", programmesAtLevel: atLevel.length });
      continue;
    }
    const matched = atLevel.filter((p) => {
      const pText = fold([p.name, p.level, p.fields].filter(Boolean).join(" "));
      return words.every((w) => uText.includes(w) || pText.includes(w));
    });
    if (matched.length > 0) out.push({ university: u, programmes: matched, matchedBy: "programmes", programmesAtLevel: atLevel.length });
  }
  return out;
}

/** Universities and programmes in a result, for the counts the page and the buttons show. */
export function matchCounts(matches: readonly CatalogueMatch<SearchUniversity, SearchProgramme>[]): { universities: number; programmes: number } {
  return { universities: matches.length, programmes: matches.reduce((n, m) => n + m.programmes.length, 0) };
}

/**
 * Where in a piece of text the search's words are, for marking them: pairs of
 * [start, end) in the text as written. Folding never changes a string's length
 * letter for letter except for combining accents, which are measured here on
 * the text as written.
 */
export function highlightRanges(text: string, words: readonly string[]): [number, number][] {
  if (words.length === 0 || !text) return [];
  // Each written character, folded, and where it sits in the original.
  const chars: { c: string; at: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const folded = text[i]
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, " ");
    for (const c of folded) chars.push({ c, at: i });
  }
  const flat = chars.map((x) => x.c).join("");
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let from = flat.indexOf(w); from !== -1; from = flat.indexOf(w, from + 1)) {
      ranges.push([chars[from].at, chars[from + w.length - 1].at + 1]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
