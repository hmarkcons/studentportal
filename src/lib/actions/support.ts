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

export async function replyToTicket(ticketId: string, authorType: "staff" | "student", _prevState: unknown, formData: FormData) {
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

  revalidatePath("/portal/support");
  return { success: true };
}
