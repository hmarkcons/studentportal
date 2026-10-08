// What a search box's words become in a PostgREST filter — for the leads
// list, the registered students list and the search at the top of every staff
// page, so the three find the same people for the same words.
//
// The words go inside an or=(…) filter, where a comma ends a condition,
// brackets group them and a double quote ends the value: those are taken out.
// "*" and "%" are wildcards to PostgREST, and taken out too. An underscore is
// kept: it is in email addresses ("ali_khan@gmail.com"), and replacing it with
// a space — as the lists used to — meant no address with one could be found.
// To ilike an underscore matches any one character, itself included, so an
// address is still found exactly.
//
// Pure, so the unit tests import it directly (scripts/list-search-test.mjs).

/** The longest search kept. */
export const SEARCH_MAX = 100;

/** The words as they can safely go into a filter, or "" for nothing to search. */
export function searchTerm(raw: string | null | undefined): string {
  return (raw ?? "")
    .slice(0, SEARCH_MAX)
    .replace(/^mailto:/i, "")
    .replace(/[%*,()\\"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether what was typed is an email address, or the part of one with its @. */
export function looksLikeEmail(term: string): boolean {
  return term.includes("@") && !/\s/.test(term);
}

/** "a.ilike."%x%",b.ilike."%x%"" — the columns a term is looked for in, as one or=(…) list. */
export function ilikeAny(columns: readonly string[], term: string): string {
  return columns.map((c) => `${c}.ilike."%${term}%"`).join(",");
}
