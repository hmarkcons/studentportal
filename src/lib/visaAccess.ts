/**
 * Who may see a student's visa section.
 *
 * The Super Admin and the Processing team, as the office asked. Processing
 * runs the visa: they book the appointment, hold the portal login and record
 * the decision. A counselor does not, and the section carries two things a
 * counselor has no call to read — a student's refusal history and the
 * credentials to their appointment portal.
 *
 * One function, used by both the tab strip and the page itself. A hidden tab
 * is not a permission: the URL is guessable, so the page checks too.
 */
export function canSeeVisaSection(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "processing";
}
