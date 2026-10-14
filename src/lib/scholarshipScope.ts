// Which scholarship bodies a student's application may show — their names,
// their guides — and nothing else.
//
// Never the country's whole directory: Italy has over twenty regional DSU
// bodies, and a student going to Pisa has one, DSU Toscana. Listing the rest
// read as a choice the student had, and on the staff tab put every region's
// deadlines and income thresholds beside the one that applies.
//
//   * Where every student is offered one (Italy's DSU), a body shows once its
//     university is finalised for pre-enrolment, and then only that
//     university's own: the one set on it in Setup, or else the one whose
//     covers name it (scholarshipMatch.ts). With none linked, none shows —
//     staff choose it for the student, and from then on it is recorded.
//   * Where scholarships are awarded on merit (France), only the ones the
//     student has been put forward for — recorded — ever show.
//   * A body already recorded for the student always shows: it is theirs.
//
// Pure, so the unit tests import it directly (scripts/scholarship-scope-test.mjs).
import { bodiesForUniversity, type MatchableBody } from "./scholarshipMatch.ts";

/** The body or bodies that award scholarships at a university, out of its country's. */
export function universityBodies<T extends MatchableBody>(university: { name: string; dsuBodyId?: string | null }, countryBodies: readonly T[]): T[] {
  if (university.dsuBodyId) {
    const set = countryBodies.filter((b) => b.id === university.dsuBodyId);
    if (set.length > 0) return set;
  }
  return bodiesForUniversity(university.name, [...countryBodies]);
}

export type ScopeInput<T extends MatchableBody> = {
  /** The country's scholarship_access: "universal" where every student is offered one. */
  access: string | null | undefined;
  /** The university is finalised for pre-enrolment. */
  finalized: boolean;
  university: { name: string; dsuBodyId?: string | null };
  /** The bodies of the university's country. */
  countryBodies: readonly T[];
  /** The bodies recorded for the student on this application. */
  recorded: readonly T[];
};

export type Scope<T> = {
  /** What may be shown for this application, in this order: its own body, then any recorded beside it. */
  shown: T[];
  /** The university's own body or bodies, once finalised; empty before, or with none linked. */
  own: T[];
  /** Finalised, offered to every student, and no body linked to the university: staff are to choose it. */
  needsChoice: boolean;
};

export function scholarshipScope<T extends MatchableBody>({ access, finalized, university, countryBodies, recorded }: ScopeInput<T>): Scope<T> {
  const universal = access === "universal";
  const own = universal && finalized ? universityBodies(university, countryBodies) : [];
  const shown = [...own];
  for (const b of recorded) if (!shown.some((s) => s.id === b.id)) shown.push(b);
  return { shown, own, needsChoice: universal && finalized && own.length === 0 && recorded.length === 0 };
}
