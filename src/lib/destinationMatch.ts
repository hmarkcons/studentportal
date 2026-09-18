// Turning whatever a staff member typed for a country into an actual
// destination row.
//
// Destinations are named "Italy (Public)", "United Kingdom (Private)" and so
// on — the suffix is the commercial track, not part of the country's name. A
// person filling in a spreadsheet writes "Italy". Both have to land on the
// same row, or an import either refuses good data or files a student against
// no country at all, which in this schema also means they never receive a
// student code (see 0194: the code is stamped from the primary destination).

export type MatchableDestination = {
  id: string;
  country: string;
  display_name: string;
  country_code: string;
};

/** Lower-cased, trimmed, inner whitespace collapsed, punctuation dropped. */
function key(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips a trailing track suffix: "Italy (Public)" -> "Italy".
 *
 * Safe because no country has more than one destination — asserted in the
 * verification for 0243 rather than assumed. So once the suffix is removed,
 * the country name alone identifies a destination unambiguously, which is
 * what lets "Italy" and even a mistakenly-typed "Italy (Private)" both
 * resolve to Italy (Public).
 */
function withoutTrack(raw: string): string {
  return raw.replace(/\s*\((?:public|private)\)\s*$/i, "").trim();
}

/**
 * Names people write that are not what the destination is called.
 *
 * Kept small and specific on purpose. A fuzzy matcher would eventually map
 * something to the wrong country silently, and a wrong country on a student's
 * record misroutes their whole application — the pipeline stages, the document
 * checklist and the visa page are all per-destination.
 */
const ALIASES: Record<string, string> = {
  uk: "united kingdom",
  "u k": "united kingdom",
  gb: "united kingdom",
  britain: "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "northern ireland": "united kingdom",
  usa: "united states",
  us: "united states",
  "u s": "united states",
  "u s a": "united states",
  america: "united states",
  "united states of america": "united states",
  "north cyprus": "northern cyprus",
  trnc: "northern cyprus",
  "turkish republic of northern cyprus": "northern cyprus",
  turkiye: "turkey",
  türkiye: "turkey",
  holland: "netherlands",
  czechia: "czech republic",
  eire: "ireland",
  "republic of ireland": "ireland",
  "new zeland": "new zealand",
  romania: "romania",
  magyarorszag: "hungary",
  deutschland: "germany",
  espana: "spain",
  italia: "italy",
  suomi: "finland",
  sverige: "sweden",
  osterreich: "austria",
};

/**
 * The destination a typed country name refers to, or null.
 *
 * Tried in order of how certain the match is: the full display name, then the
 * country, then the ISO-ish code, then the same three with any track suffix
 * removed, then the alias table. Nothing is guessed beyond that.
 */
export function resolveDestination<T extends MatchableDestination>(
  raw: string | null | undefined,
  destinations: readonly T[]
): T | null {
  const typed = (raw ?? "").trim();
  if (!typed) return null;

  const candidates = [key(typed), key(withoutTrack(typed))];
  const aliased = candidates.map((c) => ALIASES[c]).filter(Boolean) as string[];
  const all = [...new Set([...candidates, ...aliased])];

  for (const candidate of all) {
    const byDisplay = destinations.find((d) => key(d.display_name) === candidate);
    if (byDisplay) return byDisplay;
    const byCountry = destinations.find((d) => key(d.country) === candidate);
    if (byCountry) return byCountry;
    // Only for short inputs: a two-letter code is meaningful, but matching a
    // long name against a code would be an accident.
    if (candidate.length <= 3) {
      const byCode = destinations.find((d) => key(d.country_code) === candidate);
      if (byCode) return byCode;
    }
    const byDisplayWithoutTrack = destinations.find((d) => key(withoutTrack(d.display_name)) === candidate);
    if (byDisplayWithoutTrack) return byDisplayWithoutTrack;
  }

  return null;
}

/**
 * Splits a cell that may hold several countries.
 *
 * A dropdown cell holds one value, but somebody typing by hand writes
 * "Germany; Austria" — so both shapes are accepted rather than the second
 * being silently read as one unknown country.
 */
export function splitCountries(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[;,/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
