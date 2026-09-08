// How many messages the side that is looking has not seen yet.
//
// Internal notes are excluded on both sides: they are staff-only, and RLS
// already hides them from a student (messages_select_own_student), so counting
// them would give staff a badge for something the student can never see.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unread count for one student's thread.
 *
 * `side` decides both which messages count and which marker is compared:
 * a student's unread are the ones staff sent (outbound), and vice versa.
 */
export async function countUnreadMessages(
  supabase: SupabaseClient,
  studentId: string,
  side: "student" | "staff",
  readAt: string | null
): Promise<number> {
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "student")
    .eq("entity_id", studentId)
    .neq("channel", "internal_note")
    .eq("direction", side === "student" ? "outbound" : "inbound");

  // No marker means nothing has ever been opened, so everything is unread.
  if (readAt) query = query.gt("sent_at", readAt);

  const { count } = await query;
  return count ?? 0;
}
