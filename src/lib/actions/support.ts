"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createTicket(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!subject || !body) return { error: "Subject and message are required." };

  const { error } = await supabase.from("support_tickets").insert({ student_id: studentId, subject, body });
  if (error) return { error: error.message };

  revalidatePath("/portal/support");
  return { success: true };
}

export async function replyToTicket(
  ticketId: string,
  authorType: "staff" | "student",
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Message can't be empty." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("support_ticket_replies").insert({
    ticket_id: ticketId,
    author_type: authorType,
    author_id: user?.id,
    body,
  });

  if (error) return { error: error.message };

  // A staff reply moves an untouched ticket out of "open" automatically —
  // matches the doc's intent that a reply means someone is on it, without
  // making staff remember a separate status click for the common case.
  if (authorType === "staff") {
    const { data: ticket } = await supabase.from("support_tickets").select("status").eq("id", ticketId).maybeSingle();
    if (ticket?.status === "open") {
      const { error: statusError } = await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
      // The reply itself already posted successfully above — don't fail the
      // whole action over this auto-bump, but don't let it disappear either.
      if (statusError) console.error(`replyToTicket: failed to auto-bump ticket ${ticketId} to in_progress:`, statusError.message);
    }
  }

  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateTicketStatus(ticketId: string, revalidateTo: string, status: string) {
  const supabase = await createClient();
  if (!["open", "in_progress", "resolved"].includes(status)) return { error: "Choose a valid status." };

  const { error } = await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

/**
 * Records that one side has opened a ticket, clearing its "new reply" flag.
 *
 * Goes through a security-definer RPC so neither side can stamp the other's
 * marker, and so the marker never touches support_tickets itself — that table
 * bumps updated_at on write, and the staff queue is ordered by it.
 */
export async function markTicketRead(ticketId: string, side: "student" | "staff") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_ticket_read", { p_ticket_id: ticketId, p_side: side });
  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Corrects a ticket's subject.
 *
 * Only the subject: the body is the student's own description of the problem
 * and stays frozen (see migration 0134), so a correction to it belongs in a
 * reply. UPDATE on support_tickets is staff-only at the policy level, so a
 * refused write comes back as zero rows rather than an error.
 */
export async function updateTicketSubject(
  ticketId: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "A subject is required." };
  if (subject.length > 200) return { error: "Keep the subject under 200 characters." };

  const { data, error } = await supabase
    .from("support_tickets")
    .update({ subject })
    .eq("id", ticketId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You don't have permission to edit this ticket." };

  revalidatePath(revalidateTo);
  revalidatePath("/support");
  return { success: true };
}
