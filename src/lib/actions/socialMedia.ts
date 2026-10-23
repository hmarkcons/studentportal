"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaffSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { uploadedFile } from "@/lib/stagedUpload";
import { sanitizeFilename } from "@/lib/documentUpload";

// 200 MB ceiling here; the per-platform limits (limits.ts) are the real cap and
// are checked per target in the composer. This is just a sane backstop.
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export async function uploadMediaAsset(_prev: unknown, formData: FormData) {
  const denied = await requirePermission("social.posts.create", "You do not have permission to add media.");
  if (denied) return { error: denied.error };

  const file = await uploadedFile(formData, "file");
  if (!file || file.size === 0) return { error: "Choose an image or video to upload." };

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return { error: "Only images and videos can be uploaded." };
  if (file.size > MAX_MEDIA_BYTES) return { error: "That file is over 200 MB." };

  const supabase = await createClient();
  const { staff } = await getStaffSession();
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizeFilename(file.name)}`;

  const { error: upErr } = await supabase.storage.from("social-media").upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) return { error: upErr.message };

  const { data: pub } = supabase.storage.from("social-media").getPublicUrl(path);
  const { error } = await supabase.from("media_assets").insert({
    storage_path: path,
    public_url: pub.publicUrl,
    kind: isImage ? "image" : "video",
    mime_type: file.type,
    size_bytes: file.size,
    alt_text: String(formData.get("alt_text") ?? "").trim() || null,
    uploaded_by: staff?.id ?? null,
  });
  if (error) {
    // Don't leave an orphaned object behind.
    await supabase.storage.from("social-media").remove([path]);
    return { error: error.message };
  }

  revalidatePath("/social/media");
  return { success: true };
}

export async function deleteMediaAsset(assetId: string) {
  const denied = await requirePermission("social.posts.create", "You do not have permission to remove media.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const { data: asset } = await supabase.from("media_assets").select("storage_path").eq("id", assetId).maybeSingle();
  const { data, error } = await supabase.from("media_assets").delete().eq("id", assetId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That media wasn't found." };
  if (asset?.storage_path) await supabase.storage.from("social-media").remove([asset.storage_path as string]);

  revalidatePath("/social/media");
  return { success: true };
}
