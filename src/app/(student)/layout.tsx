import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { studentNav } from "@/lib/studentNav";
import { evaluateAgreementGate } from "@/lib/portalGate";
import { countUnreadMessages } from "@/lib/unreadMessages";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";
import { approvedVisaDestinations } from "@/lib/studentVisaApproval";
import { WHATSAPP_LINK } from "@/lib/constants";

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
  // Scholarship is in the menu when a country the student is going to offers
  // one — a scholarship body serves it (Setup → Scholarship bodies) — or a
  // scholarship is already recorded for them. Their countries are the ones they
  // registered for and the ones they have applications to.
  const [{ data: registered }, { data: applied }, { count: scholarshipCount }] = await Promise.all([
    supabase.from("lead_destinations").select("destination_id").eq("lead_id", studentRow.id),
    supabase.from("applications").select("university:universities(destination_id)").eq("student_id", studentRow.id),
    supabase.from("student_scholarships").select("id", { count: "exact", head: true }).eq("student_id", studentRow.id),
  ]);
  const countryIds = [
    ...new Set([
      ...(registered ?? []).map((r) => r.destination_id as string),
      ...(applied ?? []).map((a) => (Array.isArray(a.university) ? a.university[0] : a.university)?.destination_id as string | undefined),
    ]),
  ].filter((id): id is string => Boolean(id));
  const { count: bodiesForCountries } = countryIds.length
    ? await supabase.from("scholarship_body_destinations").select("destination_id", { count: "exact", head: true }).in("destination_id", countryIds)
    : { count: 0 };
  const scholarship = !gate.locked && ((bodiesForCountries ?? 0) > 0 || (scholarshipCount ?? 0) > 0);

  // Travel & Arrival appears only once a visa has actually been issued. Not in
  // the menu before that, and never for a refusal: a student who has just been
  // refused should not be looking at a tab about what to pack. The page asks
  // the same question, so the entry and the page cannot disagree.
  const approvedVisas = gate.locked ? [] : await approvedVisaDestinations(supabase, studentRow.id);

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
  const nav = studentNav({ locked: gate.locked, scholarship, travel: approvedVisas.length > 0, badges });

  return (
    <AppShell
      brand="HMARK Student Portal"
      nav={nav}
      userName={studentRow.full_name}
      userSubtitle={`Student · ${studentRow.student_code}`}
      variant="student"
      sidebarFooter={
        // Help is never more than a glance away — the one thing every page of
        // the portal has in common is that a student may get stuck on it.
        <div className="relative overflow-hidden rounded-xl bg-hero p-3.5 text-white">
          <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/15" />
          <p className="relative text-sm font-semibold">Need a hand?</p>
          <p className="relative mt-0.5 text-[11px] text-white/85">Your counsellor is one message away.</p>
          <div className="relative mt-2.5 flex flex-wrap gap-1.5">
            {!gate.locked && (
              <Link href="/portal/messages" prefetch={false} className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--hero-to)] hover:bg-white/90">
                Message
              </Link>
            )}
            <a href={WHATSAPP_LINK} className="rounded-md bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/30">
              WhatsApp
            </a>
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
