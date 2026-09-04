import { getStaffSession } from "@/lib/auth/session";
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

export default async function StaffAdminPage() {
  const { supabase, staff: viewer } = await getStaffSession();
  const isSuperAdminViewer = viewer?.role === "super_admin";

  const { data: staff } = await supabase
    .from("staff")
    .select(
      `id, full_name, role, designation, status, gender, date_of_birth, marital_status, cnic, address,
       mobile_personal, mobile_official, email_personal, email_official,
       emergency_contact_number, emergency_contact_name, emergency_contact_relation,
       monthly_salary, currency, allowance, commission_rate_general, commission_rate_public_universities,
       commission_type_general, commission_type_public_universities, monthly_target, bonus_eligible, bonus_rate_percent,
       photo_path`
    )
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
        <AddStaffButton />
      </div>
      <p className="mb-4 text-sm text-muted">Manage all staff members — add, edit, and track their details and commission rates.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Staff" value={total} icon="👥" />
        <StatCard label="Active" value={active} tone="success" icon="✅" />
        <StatCard label="Inactive" value={inactive} tone="warning" icon="⏸️" />
      </div>

      <StaffTable
        staff={staff ?? []}
        photoUrls={photoUrls}
        canManagePermissions={isSuperAdminViewer}
        permissionDefs={permissionDefs ?? []}
        roleOverrides={roleOverrides ?? []}
        staffOverrides={staffOverrides ?? []}
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
