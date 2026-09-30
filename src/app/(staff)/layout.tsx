import { hasRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { AppShell } from "@/components/AppShell";
import { buildStaffNav } from "@/lib/nav";
import { CalendarNotifier } from "@/components/CalendarNotifier";

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
  // All at once, the staff row included: this layout runs on every page, and
  // each round trip to the database is felt. A staff member's id is their
  // sign-in's, so nothing here has to wait for the row to learn it. The count
  // is of the viewer's own agreements that have been sent to them — RLS
  // returns nothing else (0271).
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const [{ staff: staffRow }, perms, { count: ownAgreements }] = await Promise.all([
    getStaffSession(),
    getEffectivePermissions(),
    supabase.from("staff_agreements").select("id", { count: "exact", head: true }).eq("staff_id", user?.id ?? ""),
  ]);

  if (!staffRow || staffRow.status !== "active") {
    redirect("/");
  }

  const isSuperAdmin = hasRole(staffRow, "super_admin");
  const nav = buildStaffNav({
    isSuperAdmin,
    hasOwnAgreement: (ownAgreements ?? 0) > 0,
    canApproveLeave: perms["leave.approve"] === true,
    perms,
  });

  return (
    <AppShell
      brand="HMARK CRM"
      nav={nav}
      userName={staffRow.full_name}
      userSubtitle={ROLE_LABELS[staffRow.role] ?? staffRow.role}
      showSearch
    >
      <CalendarNotifier />
      {children}
    </AppShell>
  );
}
