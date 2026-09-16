// What the scholarship tab may show, and why it is empty when it is.
//
// A scholarship belongs to one university, not to a shortlist. Before a
// university is finalised for pre-enrolment there is no scholarship to apply
// for — the body depends on the region the university sits in, and the
// deadlines and thresholds differ by region — so showing every open
// application's possible body reads as several live scholarships when there
// are none.

export type ScholarshipRow = {
  applicationId: string;
  destinationId: string | null;
  /** The university has been finalised for pre-enrolment. */
  preenrollmentFinalized: boolean;
  /** Its country has at least one scholarship body on file. */
  hasBody: boolean;
  /**
   * What the office decided about pursuing a scholarship here, from the
   * country's own documentation tracker.
   *
   * Italy does not ask and does not need to: its regional DSU is offered to
   * every Pakistani student and the body follows the finalised university.
   * Italy therefore arrives here as undefined, which reads as "not declined"
   * and behaves exactly as it always has.
   */
  intent?: "Yes" | "No" | "Not decided" | string | null;
};

export type ScholarshipGate = {
  /** The applications the tab may show. Empty when the gate is shut. */
  visible: ScholarshipRow[];
  /**
   * Why nothing is shown, when nothing is:
   *   no_application — the student has no applications at all
   *   no_body        — none of their countries has a scholarship body on file
   *   not_finalised  — a country could award one, but no university is
   *                    finalised for pre-enrolment yet
   *   declined       — somebody answered "No" on every country that could
   *                    have awarded one. A decision, not a gap.
   */
  reason: "no_application" | "no_body" | "not_finalised" | "declined" | null;
};

/** The office has said outright that no scholarship is being pursued here. */
export function isDeclined(row: ScholarshipRow): boolean {
  return row.intent === "No";
}

export function scholarshipGate(rows: ScholarshipRow[]): ScholarshipGate {
  if (rows.length === 0) return { visible: [], reason: "no_application" };

  const withBody = rows.filter((r) => r.destinationId && r.hasBody);
  if (withBody.length === 0) return { visible: [], reason: "no_body" };

  // A country somebody has answered "No" for is gone from this tab entirely.
  // Distinguished from the other empty states below: "we decided against it"
  // and "nobody has looked yet" are different answers, and a counselor
  // picking the student up next month needs to be able to tell them apart.
  const wanted = withBody.filter((r) => !isDeclined(r));
  if (wanted.length === 0) return { visible: [], reason: "declined" };

  // Only a finalised pre-enrolment. Per country rather than across the
  // student: an Italian pre-enrolment says nothing about which German
  // university they might end up at, so Germany stays shut until its own is
  // finalised.
  const visible = wanted.filter((r) => r.preenrollmentFinalized);
  if (visible.length === 0) return { visible: [], reason: "not_finalised" };

  return { visible, reason: null };
}

/** What the empty tab should say, in the office's terms. */
export function scholarshipGateMessage(reason: NonNullable<ScholarshipGate["reason"]>): string {
  switch (reason) {
    case "no_application":
      return "Nothing to show yet — this student has no applications. A scholarship follows the university they pre-enrol at, so it appears once one is finalised.";
    case "no_body":
      return "No scholarship applicable — none of this student's countries has a scholarship body on file. Add one in Setup › Scholarship bodies to track scholarships for a country.";
    case "not_finalised":
      return "Nothing to show until a university is finalised for pre-enrolment. The scholarship depends on the region that university sits in — its body, deadlines and income thresholds all differ — so there is nothing to apply for until one is chosen. Finalise it on the Applications tab and it will appear here.";
    case "declined":
      return "No scholarship is being pursued for this student. That was answered on the documentation tracker — change \"Applying for a scholarship?\" on the Dashboard and this tab comes back.";
  }
}
