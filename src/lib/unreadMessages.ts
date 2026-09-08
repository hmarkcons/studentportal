// How many messages the side that is looking has not seen yet.
//
// Internal notes are excluded on both sides: they are staff-only, and RLS
// already hides them from a student (messages_select_own_student), so counting
// them would give staff a badge for something the student can never see.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unread count for one student's thread.
 *
 * `side` decides both which messages count and whose marker is compared: a
 * student's unread are the ones staff sent (outbound), and vice versa.
 *
 * The marker is fetched here rather than passed in, so call sites don't have to
 * know it lives in message_read_markers — it used to sit on leads, which meant
 * every caller reading the `students` view had to reach for a second query.
 */
export async function countUnreadMessages(
  supabase: SupabaseClient,
  studentId: string,
  side: "student" | "staff"
): Promise<number> {
  const { data: marker } = await supabase
    .from("message_read_markers")
    .select("read_at")
    .eq("student_id", studentId)
    .eq("side", side)
    .maybeSingle();

  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "student")
    .eq("entity_id", studentId)
    .neq("channel", "internal_note")
    .eq("direction", side === "student" ? "outbound" : "inbound");

  // No marker means the thread has never been opened, so everything is unread.
  if (marker?.read_at) query = query.gt("sent_at", marker.read_at);

  const { count } = await query;
  return count ?? 0;
}
