import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { STUDENT_NAV } from "@/lib/nav";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";
import { countUnreadMessages } from "@/lib/unreadMessages";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";
import { approvedVisaDestinations } from "@/lib/studentVisaApproval";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getStudentUser();

  const { data: studentRow } = await supabase
    .from("leads")
    .select("id, full_name, portal_active, student_code")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  // No Student ID, no portal — and no way for staff to wave it through, which
  // is the point. The ID names the intake the student belongs to (0260), so
  // its absence means nobody has recorded which cycle they are in, and every
  // page below here is about a cycle: their deadlines, their applications,
  // their instalments. Recording the intake issues the ID and opens the door
  // in the same moment.
  //
  // "/" is safe to land on: it holds a student with no code on an explanatory
  // screen rather than sending them back here, so this cannot loop.
  if (!studentRow || !studentRow.portal_active || !studentRow.student_code) {
    redirect("/");
  }

  // Match the menu to what the proxy will actually allow. Showing the full
  // menu while every link bounces back to the agreement reads as a broken
  // portal rather than an outstanding task.
  const { data: agreements } = await supabase
    .from("agreements")
    .select("status, signing_method, signed_file_path, video_recording_path, approval_undone_at")
    .eq("student_id", studentRow.id);
  const gate = evaluateAgreementGate(agreements ?? []);
  // NavItem.href is optional (group headers have none); a menu entry with no
  // destination cannot be an allowed one.
  const visible = gate.locked
    ? STUDENT_NAV.filter((item) => Boolean(item.href) && isGateAllowedPath(item.href!))
    : STUDENT_NAV;

  // Scholarship is only in the menu for a student who has one to look at.
  // Row-level security returns their scholarships only once the application's
  // pre-enrolment is finalised, so this asks the same question the page will:
  // an empty entry would be a dead end for everyone applying outside Italy,
  // which is most of them.
  const { count: scholarshipCount } = await supabase
    .from("student_scholarships")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentRow.id);
  const withScholarship =
    !gate.locked && (scholarshipCount ?? 0) > 0
      ? [...visible, { label: "Scholarship", href: "/portal/scholarship", icon: "🎓" }]
      : visible;

  // Travel & Arrival appears only once a visa has actually been issued. Not in
  // the menu before that, and never for a refusal: a student who has just been
  // refused should not be looking at a tab about what to pack. The page asks
  // the same question, so the entry and the page cannot disagree.
  const approvedVisas = gate.locked ? [] : await approvedVisaDestinations(supabase, studentRow.id);
  const withTravel =
    approvedVisas.length > 0
      ? [...withScholarship, { label: "Travel & Arrival", href: "/portal/travel", icon: "✈️" }]
      : withScholarship;

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
  const nav = withTravel.map((i) => {
    const badge = i.href ? badges[i.href] ?? 0 : 0;
    return badge > 0 ? { ...i, badge } : i;
  });

  return (
    <AppShell brand="HMARK Student Portal" nav={nav} userName={studentRow.full_name} userSubtitle="Student">
      {children}
    </AppShell>
  );
}
