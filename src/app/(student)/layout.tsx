import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getStudentUser();

  const { data: studentRow } = await supabase
    .from("leads")
    .select("full_name, portal_active")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!studentRow || !studentRow.portal_active) {
    redirect("/");
  }

  return (
    <AppShell brand="HMARK Student Portal" nav={STUDENT_NAV} userName={studentRow.full_name} userSubtitle="Student">
      {children}
    </AppShell>
  );
}
