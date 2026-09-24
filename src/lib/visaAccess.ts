import { hasRole } from "./auth/roles.ts";

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
 *
 * Takes the staff member, not their primary role: it used to compare
 * staff.role alone, so someone holding Processing as a second role was shown
 * neither the tab nor the page.
 */
export function canSeeVisaSection(staff: Parameters<typeof hasRole>[0]): boolean {
  return hasRole(staff, "super_admin", "processing");
}
