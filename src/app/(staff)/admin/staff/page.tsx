import { hasRole } from "@/lib/auth/roles";
import { avatarUrlMap } from "@/lib/storageUrls";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AddStaffButton } from "./AddStaffButton";
import { StaffTable } from "./StaffTable";
import { PartnerApprovalButton } from "./PartnerApprovalButton";
import type { StaffRecord } from "./StaffForm";
import { COMPENSATION_EMBED, withCompensationAll, type Compensation } from "@/lib/staffCompensation";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// monthly_target is here rather than with pay on purpose: it is a
// registrations target, shown to Management and counselors on the dashboard
// and in two reports, not compensation. See 0249.
const BASE_COLUMNS = `id, full_name, role, roles, designation, status, gender, date_of_birth, marital_status, cnic, address,
   mobile_personal, mobile_official, email_personal, email_official,
   emergency_contact_number, emergency_contact_name, emergency_contact_relation,
   monthly_target, photo_path`;

export default async function StaffAdminPage() {
  const { supabase, staff: viewer } = await getStaffSession();
  const isSuperAdminViewer = hasRole(viewer, "super_admin");

  const perms = await getEffectivePermissions();
  const canManageStaff = perms["staff.manage"] === true;
  const canAssignRoles = perms["staff.assign_roles"] === true;

  // The nav hides this page from anyone holding neither permission, but the
  // URL is still typeable, and RLS would hand a counselor their own row — a
  // one-person "Staff Management" screen that looks like a bug.
  if (!canManageStaff && !canAssignRoles) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-muted">You don&apos;t have permission to view staff management.</p>
      </Card>
    );
  }

  // A roles-only viewer never receives anyone's pay, and since 0250 that is
  // enforced by the database as well: staff_compensation's own policy is
  // Super Admin, Finance, or your own row, so the embed comes back null for
  // Management even if this page asked for it.
  const { data: staffRows } = await supabase
    .from("staff")
    .select(canManageStaff ? `${BASE_COLUMNS}, ${COMPENSATION_EMBED}` : BASE_COLUMNS)
    .order("full_name")
    .returns<(Omit<StaffRecord, keyof Compensation> & { photo_path: string | null; compensation?: Compensation | null })[]>();

  // Flattened, so the form, the table and the View panel keep reading
  // `staff.monthly_salary` the way they did when it was a column.
  const staff = withCompensationAll(staffRows) as (StaffRecord & { photo_path: string | null })[];

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

  const total = staff.length;
  const active = staff.filter((s) => s.status === "active").length;
  const inactive = total - active;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Staff Management</h2>
        {canManageStaff && <AddStaffButton />}
      </div>
      <p className="mb-4 text-sm text-muted">{canManageStaff
          ? "Manage all staff members — add, edit, and track their details and commission rates."
          : "Assign each staff member the roles their job needs. Pay and personal details stay with the Super Admin."}</p>

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
        canSeePay={canManageStaff}
        permissionDefs={permissionDefs ?? []}
        roleOverrides={roleOverrides ?? []}
        staffOverrides={staffOverrides ?? []}
        assignedStudentCounts={assignedStudentCounts}
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
