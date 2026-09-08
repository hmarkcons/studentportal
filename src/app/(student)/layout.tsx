import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";
import { countUnreadMessages } from "@/lib/unreadMessages";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getStudentUser();

  const { data: studentRow } = await supabase
    .from("leads")
    .select("id, full_name, portal_active, messages_read_at_student")
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
  const visible = gate.locked
    ? STUDENT_NAV.filter((item) => Boolean(item.href) && isGateAllowedPath(item.href!))
    : STUDENT_NAV;

  // A message from their counsellor is worth surfacing in the menu — the whole
  // point of the channel is that the student does not have to think to look.
  const unread = await countUnreadMessages(supabase, studentRow.id, "student", studentRow.messages_read_at_student ?? null);
  const nav = unread > 0 ? visible.map((i) => (i.href === "/portal/messages" ? { ...i, badge: unread } : i)) : visible;

  return (
    <AppShell brand="HMARK Student Portal" nav={nav} userName={studentRow.full_name} userSubtitle="Student">
      {children}
    </AppShell>
  );
}
