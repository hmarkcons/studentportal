import { hasRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { AppShell } from "@/components/AppShell";
import { buildStaffNav } from "@/lib/nav";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  management: "Management",
  counselor: "Counselor",
  processing: "Processing",
  finance: "Finance",
  marketing: "Marketing",
  digital_marketing: "Digital Marketing",
};

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { staff: staffRow, supabase } = await getStaffSession();

  if (!staffRow || staffRow.status !== "active") {
    redirect("/");
  }

  const isSuperAdmin = hasRole(staffRow, "super_admin");
  // In parallel, not after: this layout runs on every page, and each round
  // trip to the database is felt. The count is of the viewer's own agreements
  // that have been sent to them — RLS returns nothing else (0271).
  const [perms, { count: ownAgreements }] = await Promise.all([
    getEffectivePermissions(),
    supabase.from("staff_agreements").select("id", { count: "exact", head: true }).eq("staff_id", staffRow.id),
  ]);
  // Staff Management is also where roles are assigned, so someone who holds
  // staff.assign_roles but not staff.manage still needs the link — the page
  // itself shows them the roles and withholds the rest.
  const nav = buildStaffNav({
    canManageStaff: perms["staff.manage"] === true || perms["staff.assign_roles"] === true,
    isSuperAdmin,
    hasOwnAgreement: (ownAgreements ?? 0) > 0,
  });

  return (
    <AppShell
      brand="HMARK CRM"
      nav={nav}
      userName={staffRow.full_name}
      userSubtitle={ROLE_LABELS[staffRow.role] ?? staffRow.role}
      showSearch
    >
      {children}
    </AppShell>
  );
}
