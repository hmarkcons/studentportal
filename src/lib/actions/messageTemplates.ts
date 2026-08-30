"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createMessageTemplate(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const purpose = String(formData.get("purpose") ?? "").trim();
  const channel = String(formData.get("channel") ?? "");
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").trim();

  if (!purpose || !["email", "sms", "whatsapp"].includes(channel) || !body) {
    return { error: "Purpose, channel, and body are required." };
  }

  const { error } = await supabase.from("message_templates").insert({ purpose, channel, subject, body });
  if (error) return { error: error.message };

  revalidatePath("/admin/message-templates");
  return { success: true };
}

export async function deleteMessageTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/message-templates");
  return { success: true };
}
