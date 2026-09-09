import { redirect } from "next/navigation";
import { getStaffSession } from "./session";
import { visibleReports } from "@/lib/reportsCatalogue";

/**
 * Gates a report page on the same catalogue that decides whether its card is
 * shown on /reports.
 *
 * REPORT_CATALOGUE listed roles per report from the start, but only the index
 * page consulted it — every one of the nine report URLs was reachable by any
 * active staff member who typed it. Row-level security stopped that being a
 * leak (a counselor sees their own students' invoices and their own commission
 * row, nothing more), but it made the pages lie: "Staff Commission Report"
 * rendered as a one-row company table, and "Revenue & Commission" showed one
 * counselor's students' money under the heading "Total invoiced". A report that
 * quietly shows a subset under a total's label is worse than one that refuses.
 *
 * Redirects rather than 404s, matching /admin/permissions: the person is
 * legitimately staff, just not an audience for this report.
 *
 * Fails closed — an href with no catalogue entry is denied to everyone,
 * including Super Admin, rather than defaulting to open. A test asserts the
 * page directories and the catalogue agree, so a typo is caught there instead
 * of by someone finding the report gone.
 */
export async function requireReportAccess(href: string) {
  const { supabase, staff } = await getStaffSession();
  if (!visibleReports(staff?.role).some((r) => r.href === href)) redirect("/dashboard");
  return { supabase, staff };
}
