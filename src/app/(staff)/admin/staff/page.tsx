import { hasRole } from "@/lib/auth/roles";
import { avatarUrlMap } from "@/lib/storageUrls";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AddStaffButton } from "./AddStaffButton";
import { StaffTable } from "./StaffTable";
import { StaffDetails } from "./StaffDetails";
import { PartnerApprovalButton } from "./PartnerApprovalButton";
import type { StaffRecord } from "./StaffForm";
import { COMPENSATION_EMBED, withCompensationAll, type Compensation } from "@/lib/staffCompensation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffLoginSummary } from "./StaffLoginPanel";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// monthly_target is here rather than with pay on purpose: it is a
// registrations target, shown to Management and counselors on the dashboard
// and in two reports, not compensation. See 0249.
//
// The personal details — CNIC, date of birth, address, personal contacts,
// emergency contact — are not columns a signed-in user may select (0285).
// They come from staff_personal_details(), which returns the viewer's own, or
// everyone's for a Super Admin, and are merged in by id.
const WORK_COLUMNS = `id, full_name, role, roles, designation, status, mobile_official, email_official, monthly_target, photo_path, joined_on`;

type PersonalDetails = {
  id: string;
  gender: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  cnic: string | null;
  address: string | null;
  mobile_personal: string | null;
  email_personal: string | null;
  emergency_contact_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
};

type StaffRow = Omit<StaffRecord, keyof Compensation> & { photo_path: string | null; compensation?: Compensation | null };

function withPersonal<T extends { id: string }>(rows: T[] | null, personal: PersonalDetails[] | null): T[] {
  const byId = new Map((personal ?? []).map((p) => [p.id, p]));
  return (rows ?? []).map((r) => ({ ...r, ...(byId.get(r.id) ?? {}) }));
}

export default async function StaffAdminPage() {
  const { supabase, staff: viewer } = await getStaffSession();
  const isSuperAdminViewer = hasRole(viewer, "super_admin");

  const perms = await getEffectivePermissions();
  // The Super Admin's alone, and not grantable to anyone else (0284).
  const canManageStaff = perms["staff.manage"] === true;

  // Everyone else sees one record here — their own — and changes nothing.
  // Their details and roles are the Super Admin's to keep up to date. What the
  // database lets them read says the same: every colleague's personal details
  // are withheld from them (0285), and their own come from
  // staff_personal_details().
  if (!canManageStaff) {
    const myId = viewer?.id ?? "";
    const [{ data: meRow }, { data: myPersonal }] = await Promise.all([
      supabase.from("staff").select(`${WORK_COLUMNS}, ${COMPENSATION_EMBED}`).eq("id", myId).returns<StaffRow[]>(),
      supabase.rpc("staff_personal_details", { p_staff: myId }),
    ]);
    const me = (withCompensationAll(withPersonal(meRow, myPersonal as PersonalDetails[] | null)) as (StaffRecord & { photo_path: string | null })[])[0];
    const myPhoto = me?.photo_path ? (await avatarUrlMap([me.photo_path])).get(me.photo_path) : undefined;
    return (
      <div className="w-full max-w-3xl">
        <h2 className="mb-1 text-lg font-semibold text-ink">Staff Management</h2>
        <p className="mb-4 text-sm text-muted">
          Your own record. Only the Super Admin can change staff details or give anyone a role — ask them if anything here needs
          correcting.
        </p>
        <Card>
          {me ? (
            <div data-own-staff-record>
              <p className="mb-3 text-base font-semibold text-ink">{me.full_name}</p>
              <StaffDetails staff={me} photoUrl={myPhoto ?? null} />
            </div>
          ) : (
            <p className="text-sm text-muted">Your staff record could not be found. Ask the Super Admin to check it.</p>
          )}
        </Card>
      </div>
    );
  }

  const [{ data: staffRows }, { data: personal }] = await Promise.all([
    supabase.from("staff").select(`${WORK_COLUMNS}, ${COMPENSATION_EMBED}`).order("full_name").returns<StaffRow[]>(),
    supabase.rpc("staff_personal_details"),
  ]);

  // Flattened, so the form, the table and the View panel keep reading
  // `staff.monthly_salary` and `staff.cnic` the way they did when both were
  // columns on this table.
  const staff = withCompensationAll(withPersonal(staffRows, personal as PersonalDetails[] | null)) as (StaffRecord & { photo_path: string | null })[];

  // One request for the whole directory's photos, not one per person, and
  // through avatarUrls so the URLs are the ones the browser already has. This
  // page shows every staff member, so it was the worst of both problems.
  const photoByPath = await avatarUrlMap((staff ?? []).map((s) => s.photo_path));
  const photoUrls: Record<string, string> = {};
  for (const s of staff ?? []) {
    const url = s.photo_path ? photoByPath.get(s.photo_path) : undefined;
    if (url) photoUrls[s.id] = url;
  }

  const { data: pendingPartners } = await supabase
    .from("partner_university_accounts")
    .select("id, staff_name, status, university:universities(name)")
    .eq("status", "pending");

  // Powers the "you must pick a replacement" prompt when deactivating a
  // staff member who still has students pointed at them.
  const { data: assignedLeads } = await supabase.from("leads").select("assigned_counselor_id").not("assigned_counselor_id", "is", null);
  const assignedStudentCounts: Record<string, number> = {};
  for (const l of assignedLeads ?? []) {
    if (l.assigned_counselor_id) assignedStudentCounts[l.assigned_counselor_id] = (assignedStudentCounts[l.assigned_counselor_id] ?? 0) + 1;
  }

  const [{ data: permissionDefs }, { data: roleOverrides }, { data: staffOverrides }] = isSuperAdminViewer
    ? await Promise.all([
        supabase.from("permission_definitions").select("key, category, label, description, default_roles"),
        supabase.from("role_permission_overrides").select("role, permission_key, allowed"),
        supabase.from("staff_permission_overrides").select("staff_id, permission_key, allowed"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  // Each staff member's login, for the Super Admin's Login panel: the email
  // they actually sign in with, whether they ever have, and whether a copy of
  // their password is kept. Auth accounts and the kept copies are readable
  // only with the service role, so this is fetched for a Super Admin viewer
  // and nobody else — for anyone else the panel is not offered at all.
  let logins: Record<string, StaffLoginSummary> | undefined;
  if (isSuperAdminViewer) {
    const admin = createAdminClient();
    const [users, { data: kept }] = await Promise.all([
      Promise.all(staff.map((s) => admin.auth.admin.getUserById(s.id))),
      admin.from("staff_login_credentials").select("staff_id, updated_at"),
    ]);
    const keptAt = new Map((kept ?? []).map((k: { staff_id: string; updated_at: string }) => [k.staff_id, k.updated_at]));
    logins = {};
    staff.forEach((s, i) => {
      const user = users[i].data?.user;
      logins![s.id] = {
        loginEmail: user?.email ?? null,
        lastSignInAt: user?.last_sign_in_at ?? null,
        copyKeptAt: keptAt.get(s.id) ?? null,
      };
    });
  }

  const total = staff.length;
  const active = staff.filter((s) => s.status === "active").length;
  const inactive = total - active;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Staff Management</h2>
        <AddStaffButton />
      </div>
      <p className="mb-4 text-sm text-muted">Manage all staff members — add, edit, and track their details, roles and commission rates.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Staff" value={total} icon="👥" />
        <StatCard label="Active" value={active} tone="success" icon="✅" />
        <StatCard label="Inactive" value={inactive} tone="warning" icon="⏸️" />
      </div>

      <StaffTable
        staff={staff}
        photoUrls={photoUrls}
        canManagePermissions={isSuperAdminViewer}
        canManagePhoto={isSuperAdminViewer}
        canGrantSuperAdmin={isSuperAdminViewer}
        permissionDefs={permissionDefs ?? []}
        roleOverrides={roleOverrides ?? []}
        staffOverrides={staffOverrides ?? []}
        assignedStudentCounts={assignedStudentCounts}
        logins={logins}
        canManageAgreements={perms["staff_agreements.manage"] === true}
      />

      {pendingPartners && pendingPartners.length > 0 && (
        <Card className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Pending partner university accounts</h3>
          <div className="flex flex-col divide-y divide-border">
            {pendingPartners.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {p.staff_name} · {one(p.university)?.name}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">pending</Badge>
                  <PartnerApprovalButton id={p.id} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
