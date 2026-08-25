import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: studentRow } = await supabase
    .from("leads")
    .select("full_name, portal_active")
    .eq("auth_user_id", user?.id ?? "")
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
