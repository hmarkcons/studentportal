"use server";

// The portal's Guide tutorials, maintained from Setup rather than hardcoded.
// Writes are gated by RLS (is_active_staff), like the support FAQ: reference
// content shown to students, not anyone's record.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVideoUrl } from "@/lib/videoEmbed";

const SETUP_PATH = "/setup/guide-videos";
const PORTAL_PATH = "/portal/guide";

function readForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    url: String(formData.get("url") ?? "").trim(),
    is_published: formData.get("is_published") === "on",
  };
}

// The pasted link is parsed here and only the provider and id are stored, so a
// bad link is refused at save time rather than rendering an empty player to
// students — and nothing can be framed in the portal but a real video.
const LINK_HELP =
  "Paste a YouTube or Vimeo link — e.g. https://youtu.be/… , https://www.youtube.com/watch?v=… or https://vimeo.com/…";

export async function createGuideVideo(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { title, description, url, is_published } = readForm(formData);
  if (!title) return { error: "Give the tutorial a title." };

  const embed = parseVideoUrl(url);
  if (!embed) return { error: `That link isn't a video we can embed. ${LINK_HELP}` };

  const { data: last } = await supabase
    .from("guide_videos")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("guide_videos").insert({
    title,
    description,
    provider: embed.provider,
    video_id: embed.videoId,
    is_published,
    sort_order: (last?.sort_order ?? 0) + 10,
  });
  if (error) {
    // The (provider, video_id) unique index is the likely cause, and "duplicate
    // key value violates..." tells staff nothing they can act on.
    if (error.code === "23505") return { error: "That video is already in the guide." };
    return { error: error.message };
  }

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

export async function updateGuideVideo(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { title, description, url, is_published } = readForm(formData);
  if (!title) return { error: "Give the tutorial a title." };

  const embed = parseVideoUrl(url);
  if (!embed) return { error: `That link isn't a video we can embed. ${LINK_HELP}` };

  const { data, error } = await supabase
    .from("guide_videos")
    .update({ title, description, provider: embed.provider, video_id: embed.videoId, is_published })
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === "23505") return { error: "Another entry already uses that video." };
    return { error: error.message };
  }
  // Zero rows back means RLS refused the write, which would otherwise report as
  // a success over an unchanged tutorial.
  if (!data?.length) return { error: "You don't have permission to edit the guide." };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

export async function deleteGuideVideo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("guide_videos").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}

/**
 * Swaps an entry with its neighbour. Two writes whatever the list length, and
 * it cannot leave the order half-applied the way renumbering can.
 */
export async function moveGuideVideo(id: string, direction: "up" | "down") {
  const supabase = await createClient();

  const { data: rows, error: readError } = await supabase
    .from("guide_videos")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (readError) return { error: readError.message };

  const list = rows ?? [];
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) return { error: "That tutorial no longer exists." };

  const swapWith = direction === "up" ? list[index - 1] : list[index + 1];
  if (!swapWith) return { success: true };

  const mine = list[index];
  const { error: a } = await supabase.from("guide_videos").update({ sort_order: swapWith.sort_order }).eq("id", mine.id);
  if (a) return { error: a.message };
  const { error: b } = await supabase.from("guide_videos").update({ sort_order: mine.sort_order }).eq("id", swapWith.id);
  if (b) return { error: `Moved, but the neighbouring entry could not be updated (${b.message}). Reorder again to fix.` };

  revalidatePath(SETUP_PATH);
  revalidatePath(PORTAL_PATH);
  return { success: true };
}
