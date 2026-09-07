import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getStudentUser();

  const { data: studentRow } = await supabase
    .from("leads")
    .select("id, full_name, portal_active")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!studentRow || !studentRow.portal_active) {
    redirect("/");
  }

  // Match the menu to what the proxy will actually allow. Showing the full
  // menu while every link bounces back to the agreement reads as a broken
  // portal rather than an outstanding task.
  const { data: agreements } = await supabase
    .from("agreements")
    .select("status, signing_method, signed_file_path, video_recording_path")
    .eq("student_id", studentRow.id);
  const gate = evaluateAgreementGate(agreements ?? []);
  // NavItem.href is optional (group headers have none); a menu entry with no
  // destination cannot be an allowed one.
  const nav = gate.locked ? STUDENT_NAV.filter((item) => Boolean(item.href) && isGateAllowedPath(item.href!)) : STUDENT_NAV;

  return (
    <AppShell brand="HMARK Student Portal" nav={nav} userName={studentRow.full_name} userSubtitle="Student">
      {children}
    </AppShell>
  );
}
