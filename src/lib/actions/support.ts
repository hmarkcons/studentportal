"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ticketBodyError, ticketSubjectError } from "@/lib/supportTickets";

export async function createTicket(studentId: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  // Both were only checked for emptiness. The subject had a 200-character rule
  // in the edit action but not here, so a ticket could be raised with a subject
  // that then refused to save when staff tried to shorten it.
  const subjectError = ticketSubjectError(subject);
  if (subjectError) return { error: subjectError };
  const bodyError = ticketBodyError(body);
  if (bodyError) return { error: bodyError };

  const { error } = await supabase.from("support_tickets").insert({ student_id: studentId, subject, body });
  if (error) return { error: error.message };

  revalidatePath("/portal/support");
  return { success: true };
}

/**
 * Posts a reply, signed by whoever is actually calling.
 *
 * author_type used to be a bound argument, which means the client supplied it
 * — and nothing checked it, so a student could post a reply that rendered as
 * "HMARK Support" and a staff member could post one as the student. The policy
 * in 0156 now refuses a mismatch, and the side is derived here as well so the
 * UI cannot even ask for the wrong one.
 */
export async function replyToTicket(ticketId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const body = String(formData.get("body") ?? "").trim();
  const bodyError = ticketBodyError(body, "reply");
  if (bodyError) return { error: bodyError };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are signed out — sign in again to reply." };

  // Staff membership is the thing that decides which side of the conversation
  // this is. A student holds no staff row, so the fallback is the student side
  // and the policy verifies it against the ticket's owner.
  const { data: staffRow } = await supabase.from("staff").select("id").eq("id", user.id).maybeSingle();
  const authorType = staffRow ? "staff" : "student";

  const { error } = await supabase.from("support_ticket_replies").insert({
    ticket_id: ticketId,
    author_type: authorType,
    author_id: user.id,
    body,
  });

  if (error) return { error: error.message };

  // The status change and the ticket's last-activity time are the trigger's
  // job now (0156), so they happen however the reply arrives — and a student
  // reopening a resolved ticket works, which it could not from here: UPDATE on
  // support_tickets is staff-only.
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function updateTicketStatus(ticketId: string, revalidateTo: string, status: string) {
  const supabase = await createClient();
  if (!["open", "in_progress", "resolved"].includes(status)) return { error: "Choose a valid status." };

  const { data, error } = await supabase
    .from("support_tickets")
    .update({ status })
    .eq("id", ticketId)
    .select("id");
  if (error) return { error: error.message };
  // UPDATE is staff-only at the policy level, and a refused write comes back as
  // zero rows rather than an error — which this reported as a cheerful success
  // over a status that had not moved.
  if (!data?.length) return { error: "You don't have permission to change this ticket's status." };

  revalidatePath(revalidateTo);
  revalidatePath("/support");
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
  const subjectError = ticketSubjectError(subject);
  if (subjectError) return { error: subjectError };

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
