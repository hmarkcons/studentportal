import { hasRole } from "@/lib/auth/roles";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AddStaffButton } from "./AddStaffButton";
import { StaffTable } from "./StaffTable";
import { PartnerApprovalButton } from "./PartnerApprovalButton";
import type { StaffRecord } from "./StaffForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

// Columns every viewer of this page may see. Pay is added separately below.
const BASE_COLUMNS = `id, full_name, role, roles, designation, status, gender, date_of_birth, marital_status, cnic, address,
   mobile_personal, mobile_official, email_personal, email_official,
   emergency_contact_number, emergency_contact_name, emergency_contact_relation,
   photo_path`;

const PAY_COLUMNS = `monthly_salary, currency, allowance, commission_rate_general, commission_rate_public_universities,
   commission_type_general, commission_type_public_universities, monthly_target, bonus_eligible, bonus_rate_percent`;

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

  // A roles-only viewer never receives anyone's pay. RLS on `staff` does still
  // permit Management to read these columns (policy "staff_select", 0006), so
  // this is what keeps the figures out of their browser rather than a database
  // boundary — noted because the two are easy to confuse.
  const { data: staff } = await supabase
    .from("staff")
    .select(canManageStaff ? `${BASE_COLUMNS}, ${PAY_COLUMNS}` : BASE_COLUMNS)
    .order("full_name")
    .returns<(StaffRecord & { photo_path: string | null })[]>();

  const photoUrls: Record<string, string> = {};
  await Promise.all(
    (staff ?? [])
      .filter((s) => s.photo_path)
      .map(async (s) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(s.photo_path!, 3600);
        if (data?.signedUrl) photoUrls[s.id] = data.signedUrl;
      })
  );

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

  const total = staff?.length ?? 0;
  const active = (staff ?? []).filter((s) => s.status === "active").length;
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
        staff={staff ?? []}
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
