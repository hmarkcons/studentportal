// Who is waiting on whom, for the support queue and the student's portal.
//
// The two sides ask different questions, so they are answered differently
// rather than through one shared "unread" idea:
//
//   - Staff ask "which tickets are waiting on me", which the thread already
//     answers: the last activity came from the student, or nobody has replied
//     yet. No read marker needed, and none is kept.
//   - A student asks "has support replied since I last looked", which only a
//     marker can answer — see support_ticket_read_markers.

import type { SupabaseClient } from "@supabase/supabase-js";

export type TicketActivity = {
  lastStudentAt: string | null;
  lastStaffAt: string | null;
};

/** Latest reply time per side, for the given tickets. */
export async function loadTicketActivity(
  supabase: SupabaseClient,
  ticketIds: string[]
): Promise<Map<string, TicketActivity>> {
  const activity = new Map<string, TicketActivity>();
  if (ticketIds.length === 0) return activity;

  const { data } = await supabase
    .from("support_ticket_replies")
    .select("ticket_id, author_type, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });

  for (const r of data ?? []) {
    const entry = activity.get(r.ticket_id) ?? { lastStudentAt: null, lastStaffAt: null };
    // Ascending order, so the last write per side wins.
    if (r.author_type === "staff") entry.lastStaffAt = r.created_at;
    else entry.lastStudentAt = r.created_at;
    activity.set(r.ticket_id, entry);
  }
  return activity;
}

/**
 * A ticket is waiting on staff when it is not resolved and the newest thing on
 * it came from the student — including a ticket nobody has replied to at all,
 * which is the most important case and the easiest to leave out.
 */
export function awaitingStaff(
  ticket: { id: string; status: string },
  activity: Map<string, TicketActivity>
): boolean {
  if (ticket.status === "resolved") return false;
  const a = activity.get(ticket.id);
  if (!a || (!a.lastStudentAt && !a.lastStaffAt)) return true;
  if (!a.lastStudentAt) return false;
  if (!a.lastStaffAt) return true;
  return a.lastStudentAt > a.lastStaffAt;
}

/** Read markers for one side, keyed by ticket. */
export async function loadTicketReadMarkers(
  supabase: SupabaseClient,
  ticketIds: string[],
  side: "student" | "staff"
): Promise<Map<string, string>> {
  const markers = new Map<string, string>();
  if (ticketIds.length === 0) return markers;

  const { data } = await supabase
    .from("support_ticket_read_markers")
    .select("ticket_id, read_at")
    .eq("side", side)
    .in("ticket_id", ticketIds);

  for (const m of data ?? []) markers.set(m.ticket_id, m.read_at);
  return markers;
}

/**
 * Whether the student has an unseen staff reply on this ticket. No marker at
 * all means they have never opened it, so any staff reply counts.
 */
export function hasUnseenStaffReply(
  ticketId: string,
  activity: Map<string, TicketActivity>,
  markers: Map<string, string>
): boolean {
  const lastStaffAt = activity.get(ticketId)?.lastStaffAt;
  if (!lastStaffAt) return false;
  const readAt = markers.get(ticketId);
  return !readAt || lastStaffAt > readAt;
}
