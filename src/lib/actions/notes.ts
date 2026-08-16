"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const CHANNELS = ["call", "email", "whatsapp", "system"] as const;

export async function addNote(studentId: string, _prevState: unknown, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const channel = String(formData.get("channel") ?? "call");

  if (!body) {
    return { error: "Write something first." };
  }
  if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
    return { error: "Invalid channel." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("notes")
    .insert({ student_id: studentId, author_id: user?.id, channel, body });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}
