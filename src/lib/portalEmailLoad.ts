// The student's portal emails — the welcome, the login, the new password —
// filled in from their record (portalWelcomeEmail.ts writes them). Shared by
// Send to student (studentCredentials) and Set password (portal.ts).
//
// Read with the service role: each caller has already shown that the person
// asking may see the student, and every column read here is one they may.

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/siteUrl";
import { loadEmailOffice } from "@/lib/emailOffice";
import { portalEmail, type PortalEmailKind, type TeamMember } from "@/lib/portalWelcomeEmail";

/**
 * Codes the boarding pass shows as people know them. The catalogue's own are
 * mostly ISO already; Finland is filed as FN.
 */
const PASS_CODE: Record<string, string> = { FN: "FI" };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * The welcome, the login or the new-password email, filled in from the student's record: their
 * primary destination, intake and level, and the counsellor and processing
 * officer looking after them — official numbers and addresses only (0285).
 */
export async function portalMail(studentId: string, login: { username: string; password: string }, kind: PortalEmailKind) {
  const admin = createAdminClient();
  const [{ data: lead }, { data: destinations }, office] = await Promise.all([
    admin
      .from("leads")
      .select("full_name, student_code, intake, level_applying_for, assigned_counselor_id, processing_officer_id")
      .eq("id", studentId)
      .maybeSingle(),
    admin.from("lead_destinations").select("is_backup, destination:destinations(country, country_code)").eq("lead_id", studentId),
    loadEmailOffice(),
  ]);
  const teamIds = [lead?.assigned_counselor_id, lead?.processing_officer_id].filter((v): v is string => Boolean(v));
  const { data: teamRows } = teamIds.length
    ? await admin.from("staff").select("id, full_name, designation, mobile_official, email_official, status").in("id", teamIds)
    : { data: [] as { id: string; full_name: string | null; designation: string | null; mobile_official: string | null; email_official: string | null; status: string }[] };
  const member = (id: string | null | undefined): TeamMember | null => {
    const s = (teamRows ?? []).find((t) => t.id === id && t.status === "active");
    return s?.full_name ? { name: s.full_name, designation: s.designation ?? null, phone: s.mobile_official ?? null, email: s.email_official ?? null } : null;
  };
  const primary = (destinations ?? []).find((d) => !d.is_backup) ?? (destinations ?? [])[0];
  const dest = one(primary?.destination as { country: string | null; country_code: string | null } | { country: string | null; country_code: string | null }[] | null);
  const code = dest?.country_code ? (PASS_CODE[dest.country_code.toUpperCase()] ?? dest.country_code) : null;

  return portalEmail({
    kind,
    studentName: (lead?.full_name as string | null) ?? "",
    studentCode: (lead?.student_code as string | null) ?? null,
    loginEmail: login.username,
    password: login.password,
    siteUrl: getSiteUrl(),
    destination: dest?.country ? { name: dest.country, code } : null,
    intake: (lead?.intake as string | null) ?? null,
    level: (lead?.level_applying_for as string | null) ?? null,
    team: { counsellor: member(lead?.assigned_counselor_id as string | null), officer: member(lead?.processing_officer_id as string | null) },
    office,
  });
}
