"use server";

import { getStaffSession } from "@/lib/auth/session";
import { staffRoles } from "@/lib/auth/roles";
import { visibleReports } from "@/lib/reportsCatalogue";
import { loadCountryUniversities, loadUniversityProgrammeOptions, type DeadlineOption } from "@/lib/reports/universityDeadlinesLoad";

// The Universities and deadlines report's dependent dropdowns: a country's
// universities once a country is chosen, a university's programmes once one
// is. Open to whoever may open the report (REPORT_CATALOGUE), and read through
// their own session.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function reader() {
  const { supabase, staff } = await getStaffSession();
  const allowed = visibleReports(staffRoles(staff)).some((r) => r.href === "/reports/university-deadlines");
  return allowed ? supabase : null;
}

export async function deadlineUniversityOptions(country: string): Promise<DeadlineOption[]> {
  const supabase = await reader();
  if (!supabase || !UUID.test(country)) return [];
  return (await loadCountryUniversities(supabase, country)).map((u) => ({ value: u.id, label: u.city ? `${u.name} · ${u.city}` : u.name }));
}

export async function deadlineProgrammeOptions(university: string): Promise<DeadlineOption[]> {
  const supabase = await reader();
  if (!supabase || !UUID.test(university)) return [];
  return loadUniversityProgrammeOptions(supabase, university);
}
