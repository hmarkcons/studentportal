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
      await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
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
