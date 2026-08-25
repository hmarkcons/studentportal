"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function sendMessage(
  entityType: "student" | "university",
  entityId: string,
  channel: string,
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
  const supabase = await createClient();
  const body = String(formData.get("body") ?? "").trim();
  const studentIds = formData.getAll("student_ids").map(String);

  if (!body) return { error: "Message can't be empty." };
  if (studentIds.length === 0) return { error: "Select at least one student." };

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
