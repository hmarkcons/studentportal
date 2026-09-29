"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { uploadedFile } from "@/lib/stagedUpload";
import { sanitizeFilename, validateDocumentFile } from "@/lib/documentUpload";
import { parseVideoUrl } from "@/lib/videoEmbed";
import { GUIDE_LIMITS, isProfileGuideKind } from "@/lib/documentGuide";

const DENIED = "Only staff who manage the document checklist can write its guides.";
const REFUSED = "It wasn't saved — only Super Admin and Processing can change the checklist's guides.";
const BUILDER = "/setup/create-doc-checklist";

/** A requirement in the builder, or one of the five documents a profile adds (0300). */
export type GuideTarget = { templateId: string } | { profileKind: string };

function targetOf(target: GuideTarget) {
  if ("templateId" in target) {
    return { table: "document_templates" as const, column: "id" as const, value: target.templateId, folder: target.templateId };
  }
  if (!isProfileGuideKind(target.profileKind)) return null;
  return {
    table: "profile_document_guides" as const,
    column: "kind" as const,
    value: target.profileKind,
    // A folder name without the colon.
    folder: `profile-${target.profileKind.replace(/[^a-z_]+/g, "-")}`,
  };
}

/**
 * Saves a document's guide: its short note, its full guide, a sample file and
 * a video — what the student reads to prepare the document.
 *
 * Every field is on the editor and sent every time, so an empty one means
 * "take it away" — this is an editor showing what is stored, not an import
 * that may say nothing about a column. The sample is the exception: it is
 * replaced only when a new file comes, and removed only when asked.
 *
 * Asked for its row back: an update RLS refuses (0300 lets Super Admin and
 * Processing write) matches nothing and raises nothing.
 */
export async function saveDocumentGuide(target: GuideTarget, _prev: unknown, formData: FormData) {
  const denied = await requirePermission("document_checklist.manage", DENIED);
  if (denied) return { error: denied.error };
  const where = targetOf(target);
  if (!where) return { error: "That isn't a document this checklist has." };

  const note = String(formData.get("note") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "").replace(/\r\n?/g, "\n").trim() || null;
  const videoRaw = String(formData.get("video") ?? "").trim();
  if (note && note.length > GUIDE_LIMITS.note) return { error: `Keep the short note to ${GUIDE_LIMITS.note} characters — the rest belongs in the full guide.` };
  if (body && body.length > GUIDE_LIMITS.body) return { error: `The full guide is ${body.length} characters; it can be ${GUIDE_LIMITS.body} at most.` };
  const video = videoRaw ? parseVideoUrl(videoRaw) : null;
  if (videoRaw && !video) return { error: "That video link isn't one the portal can show — paste a YouTube or Vimeo address starting https://." };

  const { supabase, staff } = await getStaffSession();
  if (!staff) return { error: "You are signed out — reload the page." };

  const { data: before } = await supabase.from(where.table).select("sample_file_path").eq(where.column, where.value).maybeSingle();
  if (!before) return { error: "That document is no longer on the checklist." };

  const patch: Record<string, string | null> = {
    description: note,
    guide_body: body,
    guide_video_provider: video?.provider ?? null,
    guide_video_id: video?.videoId ?? null,
    guide_updated_at: new Date().toISOString(),
    guide_updated_by: staff.id,
  };

  // A new sample replaces the old one; "remove" takes it away.
  const file = await uploadedFile(formData, "sample");
  let uploadedPath: string | null = null;
  if (file && file.size > 0) {
    const invalid = validateDocumentFile(file, "sample");
    if (invalid) return { error: invalid };
    uploadedPath = `document-guides/${where.folder}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(uploadedPath, file, { upsert: false });
    if (uploadError) return { error: `The sample didn't upload: ${uploadError.message}` };
    patch.sample_file_path = uploadedPath;
    patch.sample_file_name = file.name;
  } else if (formData.get("remove_sample") === "on") {
    patch.sample_file_path = null;
    patch.sample_file_name = null;
  }

  const { data: saved, error } = await supabase.from(where.table).update(patch).eq(where.column, where.value).select(where.column);
  if (error || !saved?.length) {
    // The new sample is not kept when the guide it belongs to was not saved.
    if (uploadedPath) await supabase.storage.from("documents").remove([uploadedPath]);
    return { error: error?.message ?? REFUSED };
  }
  // The old sample goes once nothing points at it.
  const old = before.sample_file_path as string | null;
  if (old && "sample_file_path" in patch && patch.sample_file_path !== old) {
    await supabase.storage.from("documents").remove([old]);
  }

  revalidatePath(BUILDER);
  return { success: true as const };
}

/**
 * One country's note beneath a shared document's guide: "Spain: it must carry
 * the Hague Apostille". Empty removes it.
 */
export async function saveCountryGuideNote(target: GuideTarget, destinationId: string, noteRaw: string) {
  const denied = await requirePermission("document_checklist.manage", DENIED);
  if (denied) return { error: denied.error };
  const where = targetOf(target);
  if (!where) return { error: "That isn't a document this checklist has." };
  const note = noteRaw.trim();
  if (note.length > GUIDE_LIMITS.countryNote) return { error: `Keep a country's note to ${GUIDE_LIMITS.countryNote} characters.` };

  const supabase = await createClient();
  const { staff } = await getStaffSession();
  const key = "templateId" in target ? { template_id: target.templateId } : { profile_kind: where.value };
  const keyColumn = "templateId" in target ? "template_id" : "profile_kind";

  const { data: existing } = await supabase
    .from("document_guide_country_notes")
    .select("id")
    .eq(keyColumn, where.value)
    .eq("destination_id", destinationId)
    .maybeSingle();

  if (!note) {
    if (!existing) return { success: true as const };
    const { data: gone, error } = await supabase.from("document_guide_country_notes").delete().eq("id", existing.id).select("id");
    if (error || !gone?.length) return { error: error?.message ?? REFUSED };
  } else if (existing) {
    const { data: updated, error } = await supabase
      .from("document_guide_country_notes")
      .update({ note, updated_at: new Date().toISOString(), updated_by: staff?.id ?? null })
      .eq("id", existing.id)
      .select("id");
    if (error || !updated?.length) return { error: error?.message ?? REFUSED };
  } else {
    const { error } = await supabase
      .from("document_guide_country_notes")
      .insert({ ...key, destination_id: destinationId, note, updated_by: staff?.id ?? null });
    if (error) return { error: error.message.includes("row-level security") ? REFUSED : error.message };
  }

  revalidatePath(BUILDER);
  return { success: true as const };
}
