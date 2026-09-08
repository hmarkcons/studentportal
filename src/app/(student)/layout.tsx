import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";
import { countUnreadMessages } from "@/lib/unreadMessages";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";

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
  const visible = gate.locked
    ? STUDENT_NAV.filter((item) => Boolean(item.href) && isGateAllowedPath(item.href!))
    : STUDENT_NAV;

  // A message from their counsellor is worth surfacing in the menu — the whole
  // point of the channel is that the student does not have to think to look.
  const unread = await countUnreadMessages(supabase, studentRow.id, "student");

  // Support tickets are the escalation path, so a reply there needs surfacing
  // at least as much as a message does.
  const { data: tickets } = await supabase.from("support_tickets").select("id").eq("student_id", studentRow.id);
  const ticketIds = (tickets ?? []).map((t) => t.id);
  const [activity, markers] = await Promise.all([
    loadTicketActivity(supabase, ticketIds),
    loadTicketReadMarkers(supabase, ticketIds, "student"),
  ]);
  const unreadTickets = ticketIds.filter((id) => hasUnseenStaffReply(id, activity, markers)).length;

  const badges: Record<string, number> = {
    "/portal/messages": unread,
    "/portal/support": unreadTickets,
  };
  const nav = visible.map((i) => {
    const badge = i.href ? badges[i.href] ?? 0 : 0;
    return badge > 0 ? { ...i, badge } : i;
  });

  return (
    <AppShell brand="HMARK Student Portal" nav={nav} userName={studentRow.full_name} userSubtitle="Student">
      {children}
    </AppShell>
  );
}
