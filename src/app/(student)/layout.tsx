import Link from "next/link";
import { Headset, MessageCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { CalendarNotifier } from "@/components/CalendarNotifier";
import { loadStudentCalendarNotifications } from "@/lib/actions/portalCalendarNotifications";
import { studentNav } from "@/lib/studentNav";
import { evaluateAgreementGate } from "@/lib/portalGate";
import { countUnreadSince } from "@/lib/unreadMessages";
import { loadTicketActivity, loadTicketReadMarkers, hasUnseenStaffReply } from "@/lib/supportSignals";
import { approvedVisaDestinations } from "@/lib/studentVisaApproval";
import { WHATSAPP_LINK } from "@/lib/constants";
import { deliverNotificationEmailsSoon } from "@/lib/notificationDelivery";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getStudentUser();

  // Everything the menu needs that hangs off the student, in the one read.
  // Every page of the portal waits for this layout, and it used to ask its
  // questions one after another — nine round trips to Sydney before a page
  // could show anything, whichever page it was.
  const { data: studentRow } = await supabase
    .from("leads")
    .select(
      `id, full_name, portal_active, student_code,
       agreements(status, signing_method, signed_file_path, video_recording_path, approval_undone_at),
       lead_destinations(destination_id),
       applications(university:universities(destination_id)),
       student_scholarships(count),
       support_tickets(id),
       message_read_markers(read_at, side)`
    )
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
  const gate = evaluateAgreementGate(studentRow.agreements ?? []);
  // Alerts due an email go out once this page has been served (0320).
  deliverNotificationEmailsSoon();
  // Scholarship is in the menu when a country the student is going to offers
  // one — a scholarship body serves it (Setup → Scholarship bodies) — or a
  // scholarship is already recorded for them. Their countries are the ones they
  // registered for and the ones they have applications to.
  const countryIds = [
    ...new Set([
      ...(studentRow.lead_destinations ?? []).map((r) => r.destination_id as string),
      ...(studentRow.applications ?? []).map(
        (a) => (Array.isArray(a.university) ? a.university[0] : a.university)?.destination_id as string | undefined
      ),
    ]),
  ].filter((id): id is string => Boolean(id));
  const scholarshipCount = (studentRow.student_scholarships as { count: number }[] | null)?.[0]?.count ?? 0;
  const ticketIds = (studentRow.support_tickets ?? []).map((t) => t.id as string);
  const readAt = (studentRow.message_read_markers ?? []).find((m) => m.side === "student")?.read_at ?? null;

  // The rest at once: each needs only what the read above returned.
  const [{ count: bodiesForCountries }, approvedVisas, unread, activity, markers] = await Promise.all([
    countryIds.length
      ? supabase.from("scholarship_body_destinations").select("destination_id", { count: "exact", head: true }).in("destination_id", countryIds)
      : Promise.resolve({ count: 0 }),
    // Travel & Arrival appears only once a visa has actually been issued. Not
    // in the menu before that, and never for a refusal: a student who has just
    // been refused should not be looking at a tab about what to pack. The page
    // asks the same question, so the entry and the page cannot disagree.
    gate.locked ? Promise.resolve([]) : approvedVisaDestinations(supabase, studentRow.id),
    // A message from their counsellor is worth surfacing in the menu — the
    // whole point of the channel is that the student does not have to think
    // to look.
    countUnreadSince(supabase, studentRow.id, "student", readAt),
    // Support tickets are the escalation path, so a reply there needs
    // surfacing at least as much as a message does.
    loadTicketActivity(supabase, ticketIds),
    loadTicketReadMarkers(supabase, ticketIds, "student"),
  ]);
  const scholarship = !gate.locked && ((bodiesForCountries ?? 0) > 0 || scholarshipCount > 0);
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
        // A quiet card: the menu's one green is the page you are on.
        <div className="rounded-xl border border-sidebar-border bg-[color-mix(in_srgb,var(--sidebar-ink)_3%,transparent)] p-3.5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-2-soft)] text-[var(--accent-2-ink)]">
              <Headset className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-ink">Need a hand?</p>
              <p className="mt-0.5 text-[11px] leading-snug text-sidebar-muted">Your counsellor is one message away.</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {!gate.locked && (
              <Link href="/portal/messages" prefetch={false} className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-ink hover:bg-[var(--brand-strong)]">
                Message
              </Link>
            )}
            <a
              href={WHATSAPP_LINK}
              className="inline-flex items-center gap-1 rounded-md border border-sidebar-border px-2.5 py-1 text-[11px] font-semibold text-sidebar-ink hover:bg-[color-mix(in_srgb,var(--sidebar-ink)_5%,transparent)]"
            >
              <MessageCircle aria-hidden className="h-3 w-3 shrink-0" />
              WhatsApp
            </a>
          </div>
        </div>
      }
    >
      {/* Their calendar is closed while the portal is locked, so nothing points at it. */}
      {!gate.locked && <CalendarNotifier load={loadStudentCalendarNotifications} calendarPath="/portal/calendar" />}
      {children}
    </AppShell>
  );
}
