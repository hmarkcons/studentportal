/**
 * When each installment actually falls due.
 *
 * The office's rule, as it stands:
 *
 *   two installments   — the first on signing, the second when the admission
 *                        comes through from the first university on the
 *                        student's track;
 *   three installments — the first on signing, the second on a date that must
 *                        be set, the third on that same admission.
 *
 * The last one is an event, not a date. Nobody knows in July when a Milan
 * admission will land, and a receipt that guesses a date is a receipt the
 * student will quote back at the office in September.
 *
 * "Public" and "private" come from the destination's own track, so a student
 * registered for the UK is told about a private university and a student
 * registered for Italy about a public one, without either being hardcoded.
 */

export type DestinationTrack = "public" | "private" | null | undefined;

/** The wording printed in place of a due date. */
export function admissionCondition(track: DestinationTrack): string {
  const kind = track === "private" ? "private" : "public";
  return `On admission approval from your first ${kind} university`;
}

export type InstallmentDue = {
  /** 1-based, as the receipt numbers them. */
  no: number;
  /** A date, when this one has one. */
  date: string | null;
  /** The event it falls due on, when it has no date. */
  condition: string | null;
  /** True when staff must supply a date before the invoice can be issued. */
  dateRequired: boolean;
};

/**
 * The due plan for a schedule of `count` installments.
 *
 * `dates` is what staff have supplied so far, 1-based positions matching the
 * installments. Anything the plan says is an event ignores whatever date is
 * sitting in that slot — the rule decides, not a stale form value.
 */
export function installmentDuePlan(
  count: number,
  track: DestinationTrack,
  dates: (string | null | undefined)[] = []
): InstallmentDue[] {
  const condition = admissionCondition(track);
  const at = (i: number) => (dates[i] ?? null) || null;

  // A single payment is due when it is due; there is no milestone to wait for.
  if (count <= 1) {
    return [{ no: 1, date: at(0), condition: null, dateRequired: true }];
  }

  if (count === 2) {
    return [
      { no: 1, date: at(0), condition: null, dateRequired: true },
      { no: 2, date: null, condition, dateRequired: false },
    ];
  }

  if (count === 3) {
    return [
      { no: 1, date: at(0), condition: null, dateRequired: true },
      // Mandatory, in so many words: the office asked for this one to be a
      // real date rather than "sometime between the other two".
      { no: 2, date: at(1), condition: null, dateRequired: true },
      { no: 3, date: null, condition, dateRequired: false },
    ];
  }

  // More than three is not a plan the office offers, but the generator should
  // not fall over if one is configured: every one dated, the last on the
  // admission, which is the same shape as three.
  return Array.from({ length: count }, (_, i) => {
    const last = i === count - 1;
    return {
      no: i + 1,
      date: last ? null : at(i),
      condition: last ? condition : null,
      dateRequired: !last,
    };
  });
}

/**
 * Which installments still need a date before an invoice can be issued.
 *
 * Returned as numbers rather than a boolean so the message can name them —
 * "installment 2 needs a due date" is actionable, "check the dates" is not.
 */
export function missingDueDates(plan: InstallmentDue[]): number[] {
  return plan.filter((p) => p.dateRequired && !p.date).map((p) => p.no);
}

/** What the receipt prints in the due-date column. */
export function dueLabel(entry: InstallmentDue, formatDate: (iso: string) => string): string {
  if (entry.date) return formatDate(entry.date);
  return entry.condition ?? "—";
}
