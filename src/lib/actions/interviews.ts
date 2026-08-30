"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function upsertInterview(applicationId: string, revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const university_name = String(formData.get("university_name") ?? "").trim() || null;
  const program_name = String(formData.get("program_name") ?? "").trim() || null;
  const interview_details = String(formData.get("interview_details") ?? "").trim() || null;
  const interview_link = String(formData.get("interview_link") ?? "").trim() || null;
  const confirmed_datetime = String(formData.get("confirmed_datetime") ?? "") || null;
  const available_slots = formData
    .getAll("available_slots")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("application_interviews")
    .upsert(
      { application_id: applicationId, university_name, program_name, interview_details, interview_link, available_slots, confirmed_datetime },
      { onConflict: "application_id" }
    );
  if (error) return { error: error.message };

  revalidatePath(revalidateTo);
  return { success: true };
}
