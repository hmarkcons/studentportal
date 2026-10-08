"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readEventForm } from "@/lib/calendarEventFields";
import { eventColumns, writeRows, type WriteResult } from "@/lib/calendarQueries";
import { syncGuestInvitesAfter } from "@/lib/calendarInvites";

type ActionResult = { success?: boolean; error?: string; id?: string };

// Each write asks for its rows back. Row-level security lets the owner and
// management change a personal item; anyone else's UPDATE matches nothing and
// raises nothing, which read as "Saved." for a change that never happened.
const REFUSED = "Not saved — this item is not yours to change, or it no longer exists.";

/** The full editor, for a personal item. */
export async function updatePersonalTask(taskId: string, revalidateTo: string, _prevState: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { values, error: invalid } = readEventForm(formData);
  if (invalid) return { error: invalid };

  const { notes, ...shared } = eventColumns(values);
  const { rows, error } = await writeRows(
    (p) => supabase.from("personal_tasks").update(p).eq("id", taskId).select("id") as unknown as PromiseLike<WriteResult>,
    { title: values.title, description: notes, ...shared }
  );
  if (error) return { error };
  if (rows.length === 0) return { error: REFUSED };
  syncGuestInvitesAfter("personal_tasks", taskId);

  revalidatePath(revalidateTo);
  return { success: true, id: taskId };
}

export async function togglePersonalTask(taskId: string, revalidateTo: string, done: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_tasks")
    .update({ status: done ? "done" : "pending" })
    .eq("id", taskId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: REFUSED };
  revalidatePath(revalidateTo);
  return { success: true };
}

export async function deletePersonalTask(taskId: string, revalidateTo: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("personal_tasks").delete().eq("id", taskId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not deleted — this item is not yours, or it is already gone." };
  syncGuestInvitesAfter("personal_tasks", taskId);
  revalidatePath(revalidateTo);
  return { success: true };
}
