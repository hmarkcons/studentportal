// What is waiting on whoever is looking at the staff dashboard, item by item.
//
// The dashboard showed counsellor registration targets and nothing else, on
// the landing page every role sees — so a processing officer or someone in
// finance opened the app to a chart about somebody else's quota. Then it
// showed counts — "3 documents to review" — and sent the reader to the list of
// every student to find them. Now each waiting thing is an item naming its
// student and the address where it is dealt with (src/lib/waitingItems.ts):
// the dashboard names the first few, /waiting lists them all.
//
// Every query below goes through the caller's own session, so RLS scopes it:
// staff_can_view_student ties a counsellor to their own students and opens
// everything to management, processing and finance. The items therefore match
// what that person can actually act on; queueScope then keeps the kinds that
// are their job.

import { loadTicketActivity, awaitingStaff } from "@/lib/supportSignals";
import { karachiToday } from "@/lib/calendarDates";
import { applicationDeadline, deadlineUrgency, isUpcoming } from "@/lib/applicationDeadline";
import { DEADLINE_WINDOW_DAYS } from "@/lib/deadlineReminders";
import { formatDateOnly } from "@/lib/formatDate";
import { ROUND_DATE_FORMAT } from "@/lib/programRounds";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { ago, daysLate, lateText, openDocumentHref, type WaitingItem } from "@/lib/waitingItems";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type NamedStudent = { id: string; name: string };

export type StaffQueue = {
  /** Every waiting thing this viewer can see, each with where it is dealt with. */
  items: WaitingItem[];
};

type StudentRef = { full_name?: string; processing_officer_id?: string | null; assigned_counselor_id?: string | null } | null;

const day = (iso: string) => formatDateOnly(iso, ROUND_DATE_FORMAT);

export async function loadStaffQueue(
  supabase: SupabaseClient,
  {
    canApproveLeave = false,
  }: {
    /** leave.approve: the requests waiting on a decision are this person's to make. */
    canApproveLeave?: boolean;
  } = {}
): Promise<StaffQueue> {
  // Karachi's date, not the server's. toISOString() takes UTC, so between
  // midnight and 5am local an item that fell due yesterday was not yet counted
  // as overdue — the same off-by-one already fixed in the calendar.
  const today = karachiToday();
  // Read once, here — "2 h ago" is worked out where the items are made, not
  // in a component, which may not read the clock while it renders.
  const now = Date.now();
  const user = await getCurrentUser();
  const viewerId = user?.id ?? "";
  // The viewer's own student: theirs to process, or theirs to counsel.
  const isMine = (s: StudentRef) => Boolean(viewerId) && (s?.processing_officer_id === viewerId || s?.assigned_counselor_id === viewerId);

  const [tickets, tasks, docs, agreements, instalments, inbound, markers, inventory, deadlineRows, followUps, leave, ownAgreements] = await Promise.all([
    // Resolved tickets can wait on nobody, and leaving them out keeps this
    // well under PostgREST's 1000-row cap as the history grows.
    supabase
      .from("support_tickets")
      .select("id, status, subject, created_at, student_id, student:leads(full_name, processing_officer_id, assigned_counselor_id)")
      .neq("status", "resolved"),
    supabase
      .from("application_tasks")
      .select(
        "id, description, due_date, owner_id, application_id, application:applications(student_id, university:universities(name), student:leads(full_name, processing_officer_id, assigned_counselor_id))"
      )
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lt("due_date", today),
    supabase
      .from("student_documents")
      .select(
        "id, student_id, category, custom_name, status, uploaded_at, created_at, review_opened_at, template:document_templates(name), opener:staff!student_documents_review_opened_by_fkey(full_name), application:applications(university:universities(name)), student:leads(full_name, processing_officer_id, assigned_counselor_id)"
      )
      .in("status", ["submitted", "under_review"]),
    // Both halves present but not yet signed off — exactly the state the
    // Verify panel on the student page exists for.
    supabase
      .from("agreements")
      .select("id, student_id, signed_file_uploaded_at, video_uploaded_at, student:leads(full_name, processing_officer_id, assigned_counselor_id)")
      .eq("signing_method", "e_signature")
      .neq("status", "signed")
      .not("signed_file_path", "is", null)
      .not("video_recording_path", "is", null),
    supabase
      .from("invoice_installments")
      .select("id, installment_no, amount, due_date, invoice:invoices(student_id, currency, student:leads(full_name, processing_officer_id, assigned_counselor_id))")
      .neq("status", "paid")
      .not("due_date", "is", null)
      .lt("due_date", today),
    // Newest first: only each student's latest message matters, so if the
    // history ever passes the 1000-row cap it is the oldest that drop off.
    supabase
      .from("messages")
      .select("entity_id, sent_at")
      .eq("entity_type", "student")
      .eq("direction", "inbound")
      .neq("channel", "internal_note")
      .order("sent_at", { ascending: false }),
    supabase.from("message_read_markers").select("student_id, read_at").eq("side", "staff"),
    // A request used to sit in the queue with nothing anywhere telling the
    // people who can decide it that it existed; they had to think to visit the
    // Inventory page. Requesters see only their own rows under
    // inventory_requests_select, so for them this lists what they raised.
    supabase
      .from("inventory_requests")
      .select("id, quantity, item_name, created_at, item:inventory_items(name), requester:staff!inventory_requests_requested_by_fkey(full_name)")
      .eq("status", "pending"),
    // Scoped by RLS to the students this viewer can see, then narrowed below
    // to the ones they are the processing officer for.
    supabase
      .from("applications")
      .select(
        "id, deadline, student_id, program:programs(name, application_deadline), round:program_intake_rounds(label, application_deadline), student:leads(full_name, processing_officer_id)"
      ),
    // A lead's follow-up that has fallen due. It was counted only on the
    // leads list, so a counsellor who did not open that list missed it.
    supabase
      .from("reminders")
      .select("id, student_id, due_date, note, student:leads(full_name, status, assigned_counselor_id, processing_officer_id)")
      .eq("type", "follow_up")
      .eq("resolved", false)
      .not("due_date", "is", null)
      .lte("due_date", today),
    // Someone else's leave, waiting on this approver. Finance can read every
    // request for payroll but decides none, so only an approver asks.
    canApproveLeave
      ? supabase
          .from("leave_requests")
          .select("id, staff_id, kind, start_date, end_date, created_at, staff:staff!leave_requests_staff_id_fkey(full_name)")
          .eq("status", "pending")
          .neq("staff_id", viewerId)
      : Promise.resolve({ data: [] as never[] }),
    // The viewer's own agreement, sent to them to sign (0271).
    supabase.from("staff_agreements").select("id, title, sent_at").eq("staff_id", viewerId).eq("status", "awaiting_signature"),
  ]);

  const items: WaitingItem[] = [];

  // ---------------------------------------------------------------- deadlines
  // A deadline is the assigned processing officer's to chase, which is the
  // same rule the calendar and the reminder email use.
  for (const a of deadlineRows.data ?? []) {
    const program = one(a.program as never) as { name?: string; application_deadline?: string | null } | null;
    const round = one(a.round as never) as { label?: string; application_deadline?: string | null } | null;
    const student = one(a.student as never) as StudentRef;
    if (student?.processing_officer_id !== viewerId) continue;
    const due = applicationDeadline(a.deadline as string | null, round?.application_deadline, program?.application_deadline);
    if (!due || !isUpcoming(due, today, DEADLINE_WINDOW_DAYS)) continue;
    items.push({
      kind: "deadline",
      id: a.id as string,
      studentId: a.student_id as string,
      studentName: student?.full_name ?? "Unknown student",
      title: round?.label && program?.name ? `${program.name} (${round.label})` : program?.name ?? "Application",
      detail: `due ${day(due)} — ${deadlineUrgency(due, today)}`,
      since: due,
      href: `/students/${a.student_id}/applications/${a.id}`,
      urgent: true,
      mine: true,
    });
  }

  // --------------------------------------------------------------- agreements
  for (const a of agreements.data ?? []) {
    const student = one(a.student as never) as StudentRef;
    const inAt = [a.signed_file_uploaded_at, a.video_uploaded_at].filter(Boolean).sort().pop() ?? null;
    items.push({
      kind: "agreement",
      id: a.id as string,
      studentId: a.student_id as string,
      studentName: student?.full_name ?? "Unknown student",
      title: "Signed agreement and consent video",
      detail: inAt ? `both in ${ago(inAt, now)} — waiting for sign-off` : "both in — waiting for sign-off",
      since: inAt,
      // The Verify panel is inside the Agreement section, opened on arrival.
      href: `/students/${a.student_id}?open=agreement#card-agreement`,
      // A student who has done their part is blocked until someone signs it off.
      urgent: true,
      mine: isMine(student),
    });
  }

  // ------------------------------------------------------------------ tickets
  // Derived from the thread rather than a marker (see supportSignals).
  const ticketRows = tickets.data ?? [];
  const activity = await loadTicketActivity(supabase, ticketRows.map((t) => t.id));
  for (const t of ticketRows) {
    if (!awaitingStaff(t, activity)) continue;
    const student = one(t.student as never) as StudentRef;
    const last = activity.get(t.id)?.lastStudentAt ?? t.created_at;
    items.push({
      kind: "ticket",
      id: t.id as string,
      studentId: (t.student_id as string) ?? null,
      studentName: student?.full_name ?? "Unknown student",
      title: (t.subject as string) || "Support ticket",
      detail: `waiting on a reply — wrote ${ago(last, now)}`,
      since: last,
      href: `/support/${t.id}`,
      urgent: true,
      mine: isMine(student),
    });
  }

  // ----------------------------------------------------------------- messages
  // Newest inbound per student, compared against the staff marker. Grouped
  // here rather than in SQL because PostgREST has no GROUP BY.
  const readAt = new Map((markers.data ?? []).map((m) => [m.student_id, m.read_at]));
  const newestInbound = new Map<string, string>();
  for (const m of inbound.data ?? []) {
    const current = newestInbound.get(m.entity_id);
    if (!current || m.sent_at > current) newestInbound.set(m.entity_id, m.sent_at);
  }
  const unanswered = [...newestInbound.entries()].filter(([studentId, sentAt]) => {
    const seen = readAt.get(studentId);
    return !seen || sentAt > seen;
  });
  if (unanswered.length > 0) {
    const { data: named } = await supabase
      .from("leads")
      .select("id, full_name, processing_officer_id, assigned_counselor_id")
      .in("id", unanswered.map(([id]) => id));
    const byId = new Map((named ?? []).map((s) => [s.id as string, s]));
    for (const [studentId, sentAt] of unanswered) {
      const student = byId.get(studentId);
      // A student this viewer cannot read is not theirs to answer.
      if (!student) continue;
      items.push({
        kind: "message",
        id: studentId,
        studentId,
        studentName: student.full_name ?? "Unknown student",
        title: "Message waiting on a reply",
        detail: `wrote ${ago(sentAt, now)}`,
        since: sentAt,
        href: `/students/${studentId}/communication`,
        urgent: false,
        mine: isMine(student),
      });
    }
  }

  // -------------------------------------------------------------------- tasks
  for (const t of tasks.data ?? []) {
    const app = one(t.application as never) as { student_id?: string; university?: unknown; student?: unknown } | null;
    const student = one((app?.student ?? null) as never) as StudentRef;
    const university = one((app?.university ?? null) as never) as { name?: string } | null;
    const due = t.due_date as string;
    items.push({
      kind: "task",
      id: t.id as string,
      studentId: app?.student_id ?? null,
      studentName: student?.full_name ?? "Unknown student",
      title: t.description as string,
      detail: [university?.name, `due ${day(due)} — ${lateText(daysLate(due, today))}`].filter(Boolean).join(" · "),
      since: due,
      href: `/students/${app?.student_id}/applications/${t.application_id}#task-${t.id}`,
      urgent: true,
      // Its owner's; a task nobody owns is the student's processing officer's.
      mine: Boolean(viewerId) && (t.owner_id ? t.owner_id === viewerId : student?.processing_officer_id === viewerId),
    });
  }

  // ---------------------------------------------------------------- documents
  for (const d of docs.data ?? []) {
    const student = one(d.student as never) as StudentRef;
    const template = one(d.template as never) as { name?: string } | null;
    const university = one((one(d.application as never) as { university?: unknown } | null)?.university as never) as { name?: string } | null;
    const opener = one(d.opener as never) as { full_name?: string } | null;
    const base = (d.custom_name as string | null) ?? template?.name ?? (d.category as string | null) ?? "Document";
    const sent = (d.uploaded_at as string | null) ?? (d.created_at as string);
    items.push({
      kind: "document",
      id: d.id as string,
      studentId: d.student_id as string,
      studentName: student?.full_name ?? "Unknown student",
      title: university?.name ? `${base} — ${university.name}` : base,
      detail: `submitted ${ago(sent, now)}`,
      since: sent,
      href: openDocumentHref(d.id as string),
      urgent: false,
      mine: isMine(student),
      opened: d.review_opened_at
        ? { by: opener?.full_name ?? "someone", at: d.review_opened_at as string, ago: ago(d.review_opened_at as string, now) }
        : null,
    });
  }

  // ---------------------------------------------------------------- follow-ups
  for (const f of followUps.data ?? []) {
    const student = one(f.student as never) as (StudentRef & { status?: string | null }) | null;
    const due = f.due_date as string;
    const late = daysLate(due, today);
    items.push({
      kind: "followup",
      id: f.id as string,
      studentId: f.student_id as string,
      studentName: student?.full_name ?? "Unknown lead",
      title: (f.note as string | null)?.trim() || "Follow-up",
      detail: late > 0 ? `due ${day(due)} — ${lateText(late)}` : "due today",
      since: due,
      href: student?.status === "registered" ? `/students/${f.student_id}` : `/leads/${f.student_id}`,
      urgent: late > 0,
      // The lead's counsellor's call to make.
      mine: Boolean(viewerId) && student?.assigned_counselor_id === viewerId,
    });
  }

  // --------------------------------------------------------------------- leave
  for (const l of (leave.data ?? []) as { id: string; kind: string; start_date: string; end_date: string; created_at: string; staff: unknown }[]) {
    const who = one(l.staff as never) as { full_name?: string } | null;
    items.push({
      kind: "leave",
      id: l.id,
      studentId: null,
      studentName: null,
      title: `${who?.full_name ?? "A staff member"} — ${l.kind} leave`,
      detail: l.start_date === l.end_date ? day(l.start_date) : `${day(l.start_date)} – ${day(l.end_date)}`,
      since: l.created_at,
      href: "/admin/leave",
      // Leave that starts soon cannot wait for next week's look.
      urgent: daysLate(l.start_date, today) >= -3,
      mine: true,
    });
  }

  // ------------------------------------------------------------- own agreement
  for (const a of ownAgreements.data ?? []) {
    items.push({
      kind: "myagreement",
      id: a.id as string,
      studentId: null,
      studentName: null,
      title: (a.title as string) || "Your agreement",
      detail: a.sent_at ? `sent ${ago(a.sent_at as string, now)}` : null,
      since: (a.sent_at as string | null) ?? null,
      href: "/my-agreement",
      urgent: true,
      mine: true,
    });
  }

  // ---------------------------------------------------------------- inventory
  for (const r of inventory.data ?? []) {
    const item = one(r.item as never) as { name?: string } | null;
    const requester = one(r.requester as never) as { full_name?: string } | null;
    items.push({
      kind: "inventory",
      id: r.id as string,
      studentId: null,
      studentName: null,
      title: `${item?.name ?? (r.item_name as string | null) ?? "Item"} × ${Number(r.quantity)}`,
      detail: `requested by ${requester?.full_name ?? "someone"} ${ago(r.created_at as string, now)}`,
      since: r.created_at as string,
      href: `/inventory#request-${r.id}`,
      urgent: false,
      // Addressed to whoever decides requests, which is why it is listed at all.
      mine: true,
    });
  }

  // -------------------------------------------------------------- instalments
  for (const i of instalments.data ?? []) {
    const invoice = one(i.invoice as never) as { student_id?: string; currency?: string; student?: unknown } | null;
    const student = one((invoice?.student ?? null) as never) as StudentRef;
    const due = i.due_date as string;
    items.push({
      kind: "instalment",
      id: i.id as string,
      studentId: invoice?.student_id ?? null,
      studentName: student?.full_name ?? "Unknown student",
      title: `Instalment ${i.installment_no} — ${invoice?.currency ?? ""} ${Number(i.amount).toLocaleString("en-GB")}`.replace("—  ", "— "),
      detail: `due ${day(due)} — ${lateText(daysLate(due, today))}`,
      since: due,
      href: `/students/${invoice?.student_id}?open=invoice#card-invoice`,
      urgent: true,
      mine: true,
    });
  }

  return { items };
}
