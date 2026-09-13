// Which scholarship body pays for a given university.
//
// The directory records this in `covers`, and the only matcher that existed
// was `covers.includes(university.name)` — an exact string equality between a
// covers entry and a university's full name. Against the real data that is
// true for one university out of twenty-eight, because covers holds places
// ("Perugia", "Rome (Sapienza)", "Venice (Ca'Foscari, IUAV)") and universities
// carry their formal Italian names ("Sapienza Università di Roma").
//
// So the feature that was supposed to point staff at the right DSU agency
// pointed at nothing, and the Scholarship tab offered all twenty-one bodies
// for every university.

export type MatchableBody = {
  id: string;
  name: string;
  region?: string | null;
  covers?: string[] | null;
};

/**
 * Italian cities as the directory writes them in English, against the names
 * that appear inside a university's own title.
 *
 * Only where the two genuinely differ — "Pisa" and "Siena" need no help. Kept
 * here rather than spread through the matching so the list can be read and
 * corrected by someone who knows the cities better than the code does.
 */
const CITY_ALIASES: Record<string, string[]> = {
  florence: ["firenze"],
  genoa: ["genova"],
  milan: ["milano"],
  naples: ["napoli"],
  padua: ["padova"],
  rome: ["roma"],
  turin: ["torino"],
  venice: ["venezia"],
};

/** Letters and digits only, lowercased: apostrophes and accents differ by source. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The place names hidden inside one covers entry.
 *
 * "Venice (Ca'Foscari, IUAV)" names three usable things: the city and the two
 * universities in the brackets. "Naples / Campania" names two. Splitting them
 * out is what turns a human note into something matchable.
 */
export function coverTerms(entry: string): string[] {
  const terms: string[] = [];
  const bracketed = entry.match(/\(([^)]*)\)/g) ?? [];
  for (const b of bracketed) {
    for (const part of b.slice(1, -1).split(/[,/]/)) {
      const t = part.trim();
      if (t) terms.push(t);
    }
  }
  const outside = entry.replace(/\([^)]*\)/g, "");
  for (const part of outside.split(/[,/]/)) {
    const t = part.trim();
    if (t) terms.push(t);
  }
  return terms;
}

/** Every spelling of a term worth trying, the aliases included. */
function candidates(term: string): string[] {
  const n = normalise(term);
  if (!n) return [];
  return [n, ...(CITY_ALIASES[n] ?? []).map(normalise)];
}

/**
 * Whether this body pays for this university, and how sure we are.
 *
 *   "own"   — the body IS the university (Politecnico di Milano runs its own
 *             scholarships, and the body carries the university's name).
 *   "covers"— a place or university named in `covers` appears in the name.
 *
 * A term has to be at least four characters before a substring match counts:
 * "Bari" inside "Barinelli" is the kind of thing that makes a matcher worse
 * than no matcher.
 */
export function bodyMatch(universityName: string, body: MatchableBody): "own" | "covers" | null {
  const uni = normalise(universityName);
  if (!uni) return null;

  const bodyName = normalise(body.name);
  if (bodyName && bodyName.length >= 4 && (bodyName === uni || uni.includes(bodyName) || bodyName.includes(uni))) {
    return "own";
  }

  for (const entry of body.covers ?? []) {
    for (const term of coverTerms(entry)) {
      for (const c of candidates(term)) {
        if (c.length >= 4 && uni.includes(c)) return "covers";
      }
    }
  }
  return null;
}

/**
 * The bodies that pay for this university, best first.
 *
 * A university that runs its own scholarships returns that body alone: three
 * Milanese bodies all cover "Milan", and offering all three against
 * Politecnico di Milano would be exactly the noise this replaces.
 */
export function bodiesForUniversity<T extends MatchableBody>(universityName: string | null | undefined, bodies: T[]): T[] {
  if (!universityName) return [];
  const own: T[] = [];
  const covering: T[] = [];
  for (const b of bodies) {
    const kind = bodyMatch(universityName, b);
    if (kind === "own") own.push(b);
    else if (kind === "covers") covering.push(b);
  }
  return own.length > 0 ? own : covering;
}
