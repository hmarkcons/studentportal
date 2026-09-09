"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { isSendableChannel, messageBodyError, broadcastRecipientsError } from "@/lib/messages";

export async function sendMessage(
  entityType: "student" | "university",
  entityId: string,
  channel: string,
  revalidateTo: string,
  _prevState: unknown,
  formData: FormData
) {
  const supabase = await createClient();

  // The channel comes from the caller, not the form, so it is checked rather
  // than trusted: the column also allows email, sms and whatsapp, and the
  // thread would read such a row back as though it had been sent that way when
  // nothing in the app can send by any of them.
  if (!isSendableChannel(channel)) {
    return { error: "That channel cannot be sent from here yet — in-app and internal notes only." };
  }

  const body = String(formData.get("body") ?? "").trim();
  const bodyInvalid = messageBodyError(formData.get("body"));
  if (bodyInvalid) return { error: bodyInvalid };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase.from("staff").select("id").eq("id", user?.id ?? "").maybeSingle();

  const { error } = await supabase.from("messages").insert({
    entity_type: entityType,
    entity_id: entityId,
    channel,
    direction: staffRow ? "outbound" : "inbound",
    body,
    sent_by: staffRow?.id ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}

// Broadcast (Module 1G: "bulk/broadcast messaging for common updates across
// multiple students"). Sends the same in-app message to every selected
// student — real email/SMS/WhatsApp broadcast needs a gateway integration,
// same limitation as the per-student message thread.
export async function broadcastMessage(_prevState: unknown, formData: FormData) {
  // Messaging one student is ordinary work for whoever handles them; messaging
  // everybody at once is not, and this had no check of any kind — any active
  // staff member could reach every student their role can see.
  const denied = await requirePermission(
    "messages.broadcast",
    "You do not have permission to send a broadcast. You can still message a student from their own page."
  );
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const body = String(formData.get("body") ?? "").trim();
  // De-duplicated: the same id submitted twice would post the message twice to
  // that student.
  const studentIds = [...new Set(formData.getAll("student_ids").map(String).filter(Boolean))];

  const bodyInvalid = messageBodyError(formData.get("body"));
  if (bodyInvalid) return { error: bodyInvalid };
  const recipientsInvalid = broadcastRecipientsError(studentIds.length);
  if (recipientsInvalid) return { error: recipientsInvalid };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("id").eq("id", user?.id ?? "").maybeSingle();

  const { error } = await supabase.from("messages").insert(
    studentIds.map((entity_id) => ({
      entity_type: "student" as const,
      entity_id,
      channel: "inapp",
      direction: "outbound" as const,
      body,
      sent_by: staffRow?.id ?? null,
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/marketing/broadcast");
  return { success: true, count: studentIds.length };
}

/**
 * Records that one side has seen the thread, clearing its unread count.
 *
 * A security-definer RPC does the write: neither side may set the other's
 * marker, and letting a student update their own leads row directly would need
 * a write policy far broader than "I have read my messages".
 */
export async function markMessagesRead(studentId: string, side: "student" | "staff") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_messages_read", { p_student_id: studentId, p_side: side });
  if (error) return { error: error.message };
  return { success: true };
}
