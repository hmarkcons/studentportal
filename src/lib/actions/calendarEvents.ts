"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Single unified add-event action for the calendar's day modal — branches on
// `type` instead of running two separate forms (one for a personal reminder,
// one for a student/application task) so the modal only ever shows one
// title field and one priority field.
export async function createCalendarEvent(revalidateTo: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const type = String(formData.get("type") ?? "personal");
  const title = String(formData.get("title") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "");
  const priority = String(formData.get("priority") ?? "medium");

  if (!title || !due_date) return { error: "Title and date are required." };

  if (type === "task") {
    const application_id = String(formData.get("application_id") ?? "");
    if (!application_id) return { error: "Choose a student/application for this task." };

    const { error } = await supabase.from("application_tasks").insert({
      application_id,
      description: title,
      due_date,
      priority,
    });
    if (error) return { error: error.message };
  } else {
    const due_time = String(formData.get("due_time") ?? "").trim() || null;
    const { error } = await supabase.from("personal_tasks").insert({
      owner_id: user.id,
      title,
      due_date,
      due_time,
      priority,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(revalidateTo);
  return { success: true };
}
