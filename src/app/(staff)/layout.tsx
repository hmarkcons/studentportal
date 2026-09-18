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
  const { staff: staffRow } = await getStaffSession();

  if (!staffRow || staffRow.status !== "active") {
    redirect("/");
  }

  const isSuperAdmin = hasRole(staffRow, "super_admin");
  const perms = await getEffectivePermissions();
  // Staff Management is also where roles are assigned, so someone who holds
  // staff.assign_roles but not staff.manage still needs the link — the page
  // itself shows them the roles and withholds the rest.
  const nav = buildStaffNav({
    canManageStaff: perms["staff.manage"] === true || perms["staff.assign_roles"] === true,
    isSuperAdmin,
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
