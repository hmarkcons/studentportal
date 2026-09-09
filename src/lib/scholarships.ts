// Scholarship statuses, in one place.
//
// The list was written out twice in the UI as raw <option> values and read
// straight out of formData with no validation, so the only thing stopping a
// bad status was the CHECK constraint on student_scholarships.status — which
// surfaces as a database error rather than something a staff member can act
// on. The display side printed the raw value too, so a row read "modification"
// rather than "Modification requested".

export const SCHOLARSHIP_STATUSES = ["submitted", "pending", "accepted", "modification", "rejected"] as const;

export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];

export const SCHOLARSHIP_STATUS_LABELS: Record<ScholarshipStatus, string> = {
  submitted: "Submitted",
  pending: "Pending",
  accepted: "Accepted",
  modification: "Modification requested",
  rejected: "Rejected",
};

export const SCHOLARSHIP_STATUS_TONE: Record<ScholarshipStatus, "success" | "warning" | "danger" | "neutral"> = {
  submitted: "neutral",
  pending: "warning",
  accepted: "success",
  modification: "warning",
  rejected: "danger",
};

export function isScholarshipStatus(value: string): value is ScholarshipStatus {
  return (SCHOLARSHIP_STATUSES as readonly string[]).includes(value);
}

export function scholarshipStatusLabel(value: string): string {
  return isScholarshipStatus(value) ? SCHOLARSHIP_STATUS_LABELS[value] : value;
}

/**
 * Italy's regional DSU bodies are the only scholarships this section covers —
 * every one of the 21 in the directory is an Italian regional agency, and the
 * fields around them (ISEE and ISPE thresholds, pre-enrolment on Universitaly)
 * are instruments of that system specifically.
 *
 * Named here rather than left as a bare "IT" comparison inside the page, so it
 * is obvious that this is a deliberate scope and not an accident.
 */
export const SCHOLARSHIP_COUNTRY_CODE = "IT";

/**
 * DSU awards are denominated in euros. Kept as a constant because the award
 * amount has no currency column of its own — if this section ever covers a
 * country that pays in something else, this is the line that has to change,
 * and it should be found rather than hunted for in JSX.
 */
export const SCHOLARSHIP_CURRENCY_SYMBOL = "€";

/**
 * A scholarship record has to be identifiable: either it names a body from the
 * directory or somebody typed a name. Without one it renders as the word
 * "Scholarship" and nobody can tell the rows apart.
 */
export function scholarshipIdentityError(name: string | null, bodyId: string | null): string | null {
  if (!name?.trim() && !bodyId) {
    return "Choose a scholarship body or give the scholarship a name — otherwise the record cannot be told apart from any other.";
  }
  return null;
}
