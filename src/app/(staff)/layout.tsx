import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { STAFF_NAV } from "@/lib/nav";

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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("full_name, role, status")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!staffRow || staffRow.status !== "active") {
    redirect("/");
  }

  return (
    <AppShell
      brand="HMARK CRM"
      nav={STAFF_NAV}
      userName={staffRow.full_name}
      userSubtitle={ROLE_LABELS[staffRow.role] ?? staffRow.role}
    >
      {children}
    </AppShell>
  );
}
