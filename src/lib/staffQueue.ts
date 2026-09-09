// What is waiting on whoever is looking at the staff dashboard.
//
// The dashboard showed counsellor registration targets and nothing else, on
// the landing page every role sees — so a processing officer or someone in
// finance opened the app to a chart about somebody else's quota.
//
// Every query below goes through the caller's own session, so RLS scopes it:
// staff_can_view_student ties a counsellor to their own students and opens
// everything to management, processing and finance. The counts therefore match
// what that person can actually act on, without a role check here.

import { loadTicketActivity, awaitingStaff } from "@/lib/supportSignals";
import { karachiToday } from "@/lib/calendarDates";
import type { SupabaseClient } from "@supabase/supabase-js";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export type NamedStudent = { id: string; name: string };

export type StaffQueue = {
  ticketsWaiting: number;
  /** Students who have written and not been answered since staff last looked. */
  unreadFrom: NamedStudent[];
  overdueTasks: number;
  documentsToReview: number;
  /** Inventory requests nobody has decided. Only Management and Super Admin
   *  can decide one, and their policy is what limits the count. */
  inventoryRequestsPending: number;
  /** E-signature submissions with both halves in, waiting for sign-off. */
  agreementsToVerify: NamedStudent[];
  overdueInstalments: number;
};

export async function loadStaffQueue(supabase: SupabaseClient): Promise<StaffQueue> {
  // Karachi's date, not the server's. toISOString() takes UTC, so between
  // midnight and 5am local an item that fell due yesterday was not yet counted
  // as overdue — the same off-by-one already fixed in the calendar.
  const today = karachiToday();

  const [tickets, tasks, docs, agreements, instalments, inbound, markers, inventory] = await Promise.all([
    supabase.from("support_tickets").select("id, status"),
    supabase
      .from("application_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lt("due_date", today),
    supabase
      .from("student_documents")
      .select("id", { count: "exact", head: true })
      .in("status", ["submitted", "under_review"]),
    // Both halves present but not yet signed off — exactly the state the
    // Verify panel on the student page exists for.
    supabase
      .from("agreements")
      .select("id, student_id, student:leads(full_name)")
      .eq("signing_method", "e_signature")
      .neq("status", "signed")
      .not("signed_file_path", "is", null)
      .not("video_recording_path", "is", null),
    supabase
      .from("invoice_installments")
      .select("id", { count: "exact", head: true })
      .neq("status", "paid")
      .not("due_date", "is", null)
      .lt("due_date", today),
    supabase
      .from("messages")
      .select("entity_id, sent_at")
      .eq("entity_type", "student")
      .eq("direction", "inbound")
      .neq("channel", "internal_note"),
    supabase.from("message_read_markers").select("student_id, read_at").eq("side", "staff"),
    // A request used to sit in the queue with nothing anywhere telling the
    // people who can decide it that it existed; they had to think to visit the
    // Inventory page. Requesters see only their own rows under
    // inventory_requests_select, so for them this counts what they raised.
    supabase
      .from("inventory_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  // Support: derived from the thread rather than a marker (see supportSignals).
  const ticketRows = tickets.data ?? [];
  const activity = await loadTicketActivity(supabase, ticketRows.map((t) => t.id));
  const ticketsWaiting = ticketRows.filter((t) => awaitingStaff(t, activity)).length;

  // Messages: newest inbound per student, compared against the staff marker.
  // Grouped here rather than in SQL because PostgREST has no GROUP BY; the
  // volume is small and the alternative is a view for one dashboard row.
  const readAt = new Map((markers.data ?? []).map((m) => [m.student_id, m.read_at]));
  const newestInbound = new Map<string, string>();
  for (const m of inbound.data ?? []) {
    const current = newestInbound.get(m.entity_id);
    if (!current || m.sent_at > current) newestInbound.set(m.entity_id, m.sent_at);
  }
  const unansweredIds = [...newestInbound.entries()]
    .filter(([studentId, sentAt]) => {
      const seen = readAt.get(studentId);
      return !seen || sentAt > seen;
    })
    .map(([studentId]) => studentId);

  let unreadFrom: NamedStudent[] = [];
  if (unansweredIds.length > 0) {
    const { data: named } = await supabase.from("leads").select("id, full_name").in("id", unansweredIds);
    unreadFrom = (named ?? []).map((s) => ({ id: s.id, name: s.full_name }));
  }

  const agreementsToVerify: NamedStudent[] = (agreements.data ?? []).map((a) => {
    const student = one(a.student as never) as { full_name?: string } | null;
    return { id: a.student_id as string, name: student?.full_name ?? "Unknown student" };
  });

  return {
    ticketsWaiting,
    unreadFrom,
    overdueTasks: tasks.count ?? 0,
    documentsToReview: docs.count ?? 0,
    agreementsToVerify,
    overdueInstalments: instalments.count ?? 0,
    inventoryRequestsPending: inventory.count ?? 0,
  };
}
