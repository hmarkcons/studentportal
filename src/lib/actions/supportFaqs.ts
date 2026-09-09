"use server";

// The portal's support FAQ, maintained from Setup rather than hardcoded.
// Writes are gated by RLS (is_active_staff) rather than an app-layer
// permission: this is reference copy shown to students, in the same class as
// document templates, not anyone's record.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SETUP_PATH = "/setup/support-faqs";
const PORTAL_PATH = "/portal/support";

function readForm(formData: FormData) {
  return {
    question: String(formData.get("question") ?? "").trim(),
    answer: String(formData.get("answer") ?? "").trim(),
    is_published: formData.get("is_published") === "on",
  };
}

export async function createFaq(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { question, answer, is_published } = readForm(formData);
  if (!question || !answer) return { error: "A question and an answer are both required." };

  // New entries go to the end. Read the current maximum rather than counting
  // rows, so a deleted entry doesn't hand its position to the next one.
  const { data: last } = await supabase
    .from("support_faqs")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("support_faqs").insert({
    question,
    answer,
    is_published,
    sort_order: (last?.sort_order ?? 0) + 10,
  });
  if (error) return { error: error.message };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

export async function updateFaq(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { question, answer, is_published } = readForm(formData);
  if (!question || !answer) return { error: "A question and an answer are both required." };

  const { data, error } = await supabase
    .from("support_faqs")
    .update({ question, answer, is_published })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  // Zero rows back means RLS refused the write, which otherwise reports as a
  // cheerful success over an unchanged answer.
  if (!data?.length) return { error: "You don't have permission to edit the FAQ." };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

export async function deleteFaq(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("support_faqs").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  // As in updateFaq: RLS refuses by returning no rows, not by erroring, so
  // this reported a deletion that had not happened and the entry reappeared on
  // the next load.
  if (!data?.length) return { error: "You don't have permission to delete the FAQ." };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

/**
 * Swaps an entry with its neighbour in the given direction.
 *
 * Swapping two sort_order values rather than renumbering the list: it is two
 * writes whatever the list length, and it cannot leave the order half-applied
 * across a long table.
 */
export async function moveFaq(id: string, direction: "up" | "down") {
  const supabase = await createClient();

  const { data: rows, error: readError } = await supabase
    .from("support_faqs")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (readError) return { error: readError.message };

  const list = rows ?? [];
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) return { error: "That FAQ no longer exists." };

  const swapWith = direction === "up" ? list[index - 1] : list[index + 1];
  if (!swapWith) return { success: true }; // already at the end it was moving towards

  const mine = list[index];
  const { data: moved, error: a } = await supabase
    .from("support_faqs")
    .update({ sort_order: swapWith.sort_order })
    .eq("id", mine.id)
    .select("id");
  if (a) return { error: a.message };
  // Refused writes come back empty. Checking the first one before touching the
  // second also stops a caller who cannot write from being told the order
  // moved when nothing did.
  if (!moved?.length) return { error: "You don't have permission to reorder the FAQ." };
  const { error: b } = await supabase.from("support_faqs").update({ sort_order: mine.sort_order }).eq("id", swapWith.id);
  if (b) return { error: `Moved, but the neighbouring entry could not be updated (${b.message}). Reorder again to fix.` };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}
