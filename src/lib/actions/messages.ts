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
