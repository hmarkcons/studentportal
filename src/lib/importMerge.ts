// Matching a spreadsheet row against what the catalogue already holds, and
// working out what it actually changes.
//
// The imports used to only add: anything whose name already existed was
// skipped whole, so correcting a tuition fee for thirty programmes meant
// thirty visits to the edit form. They now add or update — which turns two
// quiet questions into decisions that have to be made explicitly.
//
// **An empty cell means nothing, not null.** A sheet with only `name` and
// `tuition_fee` columns filled in must not wipe the city, the intake dates and
// the language requirement of every row it touches. So a blank cell is "I have
// no opinion about this field" and the stored value stays. The consequence,
// accepted: the import cannot clear a field. Clearing one is an edit-form job,
// where you can see what you are removing.
//
// **A near-miss with one candidate is the same record.** "Sapienza Univ. of
// Rome" against a stored "Sapienza University of Rome" updates the stored one
// and keeps its stored name — the office asked for that over holding such rows
// back, because the sheets they receive spell names every way there is and a
// held-back row was a row nobody got round to fixing. What makes it safe is
// that every import is previewed first: the preview lists each similar-name
// match on its own, so a wrong pairing is seen before anything is written.
//
// The near-miss test itself stays strict (see isNearMiss) — Padua and Pavia
// are two universities, not a typo — and a name that is near TWO stored names
// is still held back, because then there is no right answer to pick.
//
// Everything here is pure so it can be unit-tested; the write side is in
// src/lib/actions/universities.ts.

/** A value as it is stored — after the cell has been parsed into its column's type. */
export type Cell = string | number | boolean | string[] | null;

/** What changed, for the report the import prints afterwards. */
export type FieldChange = { field: string; from: Cell; to: Cell };

/**
 * Words that never distinguish one institution from another.
 *
 * Accents are stripped before this is consulted, so "Università" arrives as
 * "universita" and only the unaccented spellings need to be listed.
 *
 * Deliberately excludes "institute", "college", "polytechnic", "technical" and
 * "school": those do tell two institutions apart, and dropping them would make
 * "Technical University of Munich" and "University of Munich" look identical.
 */
const NAME_NOISE = new Set([
  "university", "universities", "universita", "universitat", "universidad",
  "universite", "universiteit", "universidade", "univ", "uni",
  "of", "the", "at", "in", "and",
  "di", "de", "del", "della", "delle", "degli", "dell", "da", "do", "du", "des",
  "la", "le", "les", "el", "il", "lo", "los", "las", "een", "van",
]);

/** The key two rows must share exactly to be the same record. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The parts of a name that actually identify it.
 *
 * Lower-cased, accents removed, punctuation dropped, and the institution
 * boilerplate taken out — so "Università di Bologna", "University of Bologna"
 * and "Bologna University" all reduce to ["bologna"].
 */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NAME_NOISE.has(token));
}

/**
 * Optimal string alignment distance — Levenshtein, but a swap of two adjacent
 * characters costs 1 rather than 2.
 *
 * That difference is the whole point. Transposing two letters is the most
 * common way to mistype a word, so "Sapeinza" has to read as one mistake away
 * from "Sapienza". Under plain Levenshtein it is two, which is the same
 * distance as "Padua" to "Pavia" — two different universities that must not be
 * treated as one.
 */
export function osaDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** How far one token may be from another and still count as the same word. */
function typoBudget(a: string, b: string): number {
  return Math.max(1, Math.floor(Math.min(a.length, b.length) / 6));
}

/**
 * True when two names are close enough that a human would have to decide.
 *
 * Two ways to qualify, and no third:
 *
 *   1. The identifying tokens are the same multiset. Only boilerplate,
 *      punctuation, accents or word order differ — "Politecnico di Milano" and
 *      "Politecnico Milano".
 *   2. Exactly one token differs, and it differs only by a typo —
 *      "Sapeinza Rome" and "Sapienza Rome".
 *
 * Anything else is a different name. "University of Padua" and "University of
 * Pavia" reduce to one differing token two edits apart, which is over budget
 * for a five-letter word, so they stay separate — as they must, being two real
 * and distinct universities.
 *
 * A name that is normalizeName-equal is not a near miss; it is a match, and
 * the caller should have found it before asking.
 */
export function isNearMiss(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return false;

  const left = nameTokens(a).sort();
  const right = nameTokens(b).sort();
  if (left.length === 0 || right.length === 0) return false;

  // Multiset difference: strip everything the two have in common.
  const restLeft = [...left];
  const restRight = [...right];
  for (const token of [...restLeft]) {
    const at = restRight.indexOf(token);
    if (at === -1) continue;
    restRight.splice(at, 1);
    restLeft.splice(restLeft.indexOf(token), 1);
  }

  if (restLeft.length === 0 && restRight.length === 0) return true;
  if (restLeft.length !== 1 || restRight.length !== 1) return false;
  return osaDistance(restLeft[0], restRight[0]) <= typoBudget(restLeft[0], restRight[0]);
}

/**
 * The stored name this incoming one nearly matches, or null.
 *
 * Returns the first, not the best: a row with two near misses is ambiguous in
 * a way that picking a winner would hide, and the report names whichever one
 * it found so the operator goes and looks.
 */
export function findNearMiss(name: string, existingNames: Iterable<string>): string | null {
  for (const candidate of existingNames) {
    if (isNearMiss(name, candidate)) return candidate;
  }
  return null;
}

/**
 * Every stored name this incoming one nearly matches, one per distinct name.
 *
 * The import acts on a near miss only when this has exactly one entry. Two
 * means the sheet's spelling sits between two records — "Univ. of Milan"
 * against both "University of Milan" and "University of Milano" — and picking
 * either would overwrite a record on a coin toss.
 */
export function findNearMisses(name: string, existingNames: Iterable<string>): string[] {
  const found = new Map<string, string>();
  for (const candidate of existingNames) {
    const key = normalizeName(candidate);
    if (!found.has(key) && isNearMiss(name, candidate)) found.set(key, candidate);
  }
  return [...found.values()];
}

/**
 * True when the sheet said nothing about this field.
 *
 * `undefined` is a column the sheet does not have at all; the rest are a cell
 * somebody left empty. All of them mean "leave whatever is stored alone".
 *
 * `false` is NOT blank — a `no` in an interview_required cell is an opinion,
 * and has to be able to turn a stored `yes` off. Which is why the cell parsers
 * that feed this have to yield `null` for an empty boolean cell rather than
 * the `false` they used to.
 */
export function isBlank(value: Cell | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Same stored value? Arrays compare in order; numbers compare numerically. */
function sameValue(a: Cell | undefined, b: Cell | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length === right.length && left.every((v, i) => v === right[i]);
  }
  // numeric(12,2) can come back as either a number or a string depending on
  // the driver, and "3000" must not read as a change from 3000.
  if (typeof a === "number" || typeof b === "number") {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return Number(a) === Number(b);
  }
  return a === b;
}

/**
 * What an incoming row changes about a stored one.
 *
 * `patch` holds only the fields to write; `changes` is the same information
 * for the report, with the old value alongside. An empty `changes` means the
 * row is already right and must not be written at all — an UPDATE that sets a
 * column to what it already holds still counts as a change in the audit log,
 * and re-importing an unchanged sheet would fill it with noise.
 */
export function mergeRow<T extends Record<string, Cell>>(
  existing: T,
  incoming: Partial<Record<string, Cell | undefined>>
): { patch: Record<string, Cell>; changes: FieldChange[] } {
  const patch: Record<string, Cell> = {};
  const changes: FieldChange[] = [];

  for (const [field, value] of Object.entries(incoming)) {
    if (isBlank(value)) continue;
    const current = existing[field];
    if (sameValue(current, value)) continue;
    patch[field] = value as Cell;
    changes.push({ field, from: current ?? null, to: value as Cell });
  }

  return { patch, changes };
}

// ------------------------------------------------------------- the report
//
// Shared with the forms that render it, which is why it lives in this module
// rather than beside the server actions: a "use server" file may only export
// async functions, and the two sides have to agree on the shape or the
// narrowing in the form silently stops working.

export type Tally = { added: number; updated: number; unchanged: number };

/**
 * Accumulated while the import runs — identically for a preview and for the
 * real thing, which is what makes the preview worth trusting. The two differ
 * only in whether the writes are sent.
 */
export type ImportReport = {
  universities: Tally;
  programs: Tally;
  /** "Italy (Public) · Sapienza University of Rome — new university". */
  additions: string[];
  /** "Sapienza · city Rome → Milan". */
  changes: string[];
  /** "Sapienza Univ. of Rome" → updates "Sapienza University of Rome". */
  similarMatches: string[];
  /** Near two stored names at once, so neither was touched. */
  heldBack: string[];
  problems: string[];
  failures: string[];
};

export type ImportMode = "preview" | "applied";

/** The lists that can run long, and are capped for the page. */
const LONG_LISTS = ["additions", "changes", "similarMatches"] as const;
type LongList = (typeof LONG_LISTS)[number];

/**
 * What an import hands back.
 *
 * Both branches carry both discriminants, one of them as `undefined`. Without
 * that a form doing `state?.error` fails to compile against the union, and the
 * obvious fixes — a cast, or an `in` check at every use — either lose the
 * narrowing or spread across a dozen call sites.
 *
 * `fingerprint` identifies the file and settings a preview was made from. The
 * confirm step sends it back, and the server refuses to apply unless the file
 * it is handed now is that same file — otherwise a sheet swapped after the
 * preview would be written without ever having been shown.
 */
export type CatalogueImportResult =
  | { error: string; success?: undefined }
  | ({
      success: true;
      error?: undefined;
      mode: ImportMode;
      fingerprint: string;
      overflow: Record<LongList, number>;
    } & ImportReport);

export function emptyReport(): ImportReport {
  return {
    universities: { added: 0, updated: 0, unchanged: 0 },
    programs: { added: 0, updated: 0, unchanged: 0 },
    additions: [],
    changes: [],
    similarMatches: [],
    heldBack: [],
    problems: [],
    failures: [],
  };
}

/**
 * How many lines of each long list reach the page. The counts above them stay
 * exact. Generous, because a preview is read line by line before confirming —
 * but not unbounded, since the whole report travels back in one response.
 */
export const CHANGE_LIST_LIMIT = 300;

export function finishReport(report: ImportReport, mode: ImportMode, fingerprint: string): CatalogueImportResult {
  // A combined sheet repeats a university on every programme row, so one
  // problem with it — no destination, say — would otherwise be listed once
  // per row.
  const capped = { ...report, problems: [...new Set(report.problems)], heldBack: [...new Set(report.heldBack)] };
  const overflow = {} as Record<LongList, number>;
  for (const list of LONG_LISTS) {
    capped[list] = report[list].slice(0, CHANGE_LIST_LIMIT);
    overflow[list] = Math.max(0, report[list].length - CHANGE_LIST_LIMIT);
  }
  return { success: true, mode, fingerprint, overflow, ...capped };
}

/** Nothing added, nothing changed, nothing held back — say so in one line. */
export function reportIsEmpty(result: ImportReport): boolean {
  return (
    result.universities.added === 0 &&
    result.universities.updated === 0 &&
    result.programs.added === 0 &&
    result.programs.updated === 0
  );
}

/** One change, for the line the import prints: `city  Rome -> Milan`. */
export function describeChange(change: FieldChange): string {
  return `${change.field} ${renderCell(change.from)} → ${renderCell(change.to)}`;
}

export function renderCell(value: Cell): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join("; ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value);
  return text.trim() === "" ? "—" : text;
}
