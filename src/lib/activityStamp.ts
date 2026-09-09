// When something was uploaded or added, and by whom — worded for whichever of
// the three audiences is reading it.
//
// The timestamps were already recorded (student_documents.uploaded_at and
// uploaded_by_role, verified_at, application_interviews.created_at) and simply
// never shown, so a student could not tell whether the document they sent had
// arrived last week or an hour ago, and staff could not tell when a university
// had put something up.
//
// One formatter for all of it, lifted out of MessageThread where it already
// existed with the right reasoning: Karachi rather than UTC, because that is
// the office both sides are talking to, so "2:32 PM" means the same thing to a
// counsellor and to a student reading it abroad. The locale is pinned as well —
// these render on the server and hydrate on the client, which disagree about
// locale (Vercel is en-US, the browser is whatever the reader has set), and
// React treats the difference as a hydration mismatch and throws away the
// server HTML.

/** Who is reading, which decides how the other parties are named. */
export type Audience = "staff" | "student" | "partner";

/** The recorded actor on an upload. */
export type UploaderRole = "staff" | "student" | "partner";

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

/**
 * How to name whoever did it.
 *
 * A staff member's own name goes to other staff but not to a student or a
 * university: they are dealing with HMARK, not with one named employee, and
 * the name would be an unnecessary detail to publish outside the office.
 */
export function actorName(
  role: UploaderRole | null | undefined,
  audience: Audience,
  staffName?: string | null
): string {
  if (!role) return "";
  if (audience === "staff") {
    if (role === "staff") return staffName?.trim() || "a colleague";
    if (role === "student") return "the student";
    return "the university";
  }
  if (audience === "student") {
    if (role === "staff") return "HMARK";
    if (role === "student") return "you";
    return "the university";
  }
  // A university reading their own portal.
  if (role === "staff") return "HMARK";
  if (role === "student") return "the student";
  return "your team";
}

/**
 * "Uploaded 12 Nov 2026, 2:32 PM by you", or null when nothing has been
 * uploaded — an unfilled requirement should say nothing rather than "Uploaded
 * by nobody".
 */
export function uploadedLine(input: {
  at: string | null | undefined;
  byRole?: UploaderRole | null;
  audience: Audience;
  staffName?: string | null;
}): string | null {
  const when = formatStamp(input.at);
  if (!when) return null;
  const who = actorName(input.byRole, input.audience, input.staffName);
  return who ? `Uploaded ${when} by ${who}` : `Uploaded ${when}`;
}

/** "Added 12 Nov 2026, 2:32 PM" — for a requirement or an interview. */
export function addedLine(at: string | null | undefined, label = "Added"): string | null {
  const when = formatStamp(at);
  return when ? `${label} ${when}` : null;
}

/**
 * Only a real edit is worth a second line.
 *
 * A rescheduled interview is the same row with a new time, so "Added" alone
 * would still show the day the first time was entered and leave a student no
 * way to tell that the appointment in front of them had moved. But every row
 * is written and then updated within the same second — the credentials are
 * saved as a second step — and reporting that as a change would put a
 * meaningless "Last changed" on every card. A minute's grace separates the two.
 */
export const EDIT_GRACE_MS = 60_000;

export function changedLine(
  createdAt: string | null | undefined,
  updatedAt: string | null | undefined,
  label = "Last changed"
): string | null {
  if (!createdAt || !updatedAt) return null;
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return null;
  if (updated - created <= EDIT_GRACE_MS) return null;
  return addedLine(updatedAt, label);
}

/**
 * "Approved 12 Nov 2026, 4:10 PM" / "Rejected …".
 *
 * student_documents.verified_at is set whichever way the review went, so the
 * word comes from the status rather than the column name — calling a rejection
 * "verified" would be worse than saying nothing.
 */
export function reviewedLine(
  at: string | null | undefined,
  status: string | null | undefined,
  audience: Audience,
  staffName?: string | null
): string | null {
  const when = formatStamp(at);
  if (!when) return null;
  if (status !== "verified" && status !== "rejected") return null;
  const verb = status === "verified" ? "Approved" : "Rejected";
  const who = audience === "staff" ? staffName?.trim() : null;
  return who ? `${verb} ${when} by ${who}` : `${verb} ${when}`;
}
