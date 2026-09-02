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

  const isSuperAdmin = staffRow.role === "super_admin";
  const perms = await getEffectivePermissions();
  const nav = buildStaffNav({ canManageStaff: perms["staff.manage"] === true, isSuperAdmin });

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
