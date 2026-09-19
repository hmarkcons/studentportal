// Who takes over a student once they register.
//
// The counselor owns a lead; the Processing Team owns a registered student.
// That handoff was specified but never built — the officer was a dropdown on
// the registration form that nobody filled in, so all three registered students
// had no officer at all. Nothing broke loudly: the deadline reminders fall back
// to emailing the whole team when a student has none, so the work got watched
// while nobody in particular owned it.
//
// Assignment is by load, so it stays sensible as the team grows rather than
// piling everything on whoever happens to be first alphabetically.

export type OfficerLoad = {
  id: string;
  full_name: string;
  /** Registered students currently assigned to them. */
  students: number;
};

/**
 * The officer who should take the next student: fewest already held.
 *
 * Ties break on name rather than arbitrarily, so the same inputs always give
 * the same answer — a handoff that shuffles between two equally-loaded people
 * depending on row order is impossible to reason about when somebody asks why
 * a student went where they did.
 *
 * Returns null when there is nobody to hand to. The caller leaves the student
 * unassigned rather than inventing an owner, which is the state the reminder
 * fallback already copes with.
 */
export function pickProcessingOfficer(officers: OfficerLoad[]): string | null {
  if (officers.length === 0) return null;
  const sorted = [...officers].sort(
    (a, b) => a.students - b.students || a.full_name.localeCompare(b.full_name)
  );
  return sorted[0].id;
}

/**
 * Spreads several students across the team in one go, for a backfill.
 *
 * Assigns one at a time and counts each as it lands, so ten students among two
 * officers end up five and five. Doing it by a single "who is lightest now"
 * question would give all ten to the same person.
 */
export function distributeProcessingOfficers(
  studentIds: string[],
  officers: OfficerLoad[]
): { studentId: string; officerId: string }[] {
  if (officers.length === 0) return [];
  const running = officers.map((o) => ({ ...o }));
  const out: { studentId: string; officerId: string }[] = [];
  for (const studentId of studentIds) {
    const officerId = pickProcessingOfficer(running);
    if (!officerId) break;
    out.push({ studentId, officerId });
    const chosen = running.find((o) => o.id === officerId);
    if (chosen) chosen.students += 1;
  }
  return out;
}
