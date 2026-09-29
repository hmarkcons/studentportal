"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";
import { parseLoginScreenForm } from "@/lib/loginScreen";

type Result = { error?: string; success?: boolean } | undefined;

const PICTURE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/**
 * Whoever may open Setup → Login screen may change it: the same rule as the
 * page's guard. Checked here as well as by RLS (0292), because an update RLS
 * refuses raises nothing — it matches no row and reads as a clean success.
 */
async function editor() {
  const { supabase, staff } = await getStaffSession();
  if (!staff || !canOpenPath("/setup/login-screen", await getEffectivePermissions(), hasRole(staff, "super_admin"))) return null;
  return { supabase, staff };
}

function refresh() {
  revalidateTag("login-screen", { expire: 0 });
  revalidatePath("/login");
  revalidatePath("/setup/login-screen");
}

/** Saves the texts, links and colours (Setup → Login screen). */
export async function saveLoginScreen(_prev: Result, formData: FormData): Promise<Result> {
  const who = await editor();
  if (!who) return { error: "Only a Super Admin can change the login screen." };

  const parsed = parseLoginScreenForm((name) => formData.get(name));
  if ("error" in parsed) return { error: parsed.error };

  const { data, error } = await who.supabase
    .from("login_screen")
    .update({ content: parsed.content, updated_at: new Date().toISOString(), updated_by: who.staff.id })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "The login screen wasn't saved — you may not have permission to change it." };

  refresh();
  return { success: true };
}

/**
 * Puts a new picture on the login screen. Uploaded under a new name each
 * time, so a browser that has the old one cached cannot keep showing it, and
 * the old file is removed once the new one is in place.
 */
export async function uploadLoginPicture(_prev: Result, formData: FormData): Promise<Result> {
  const who = await editor();
  if (!who) return { error: "Only a Super Admin can change the login screen." };

  const file = formData.get("picture");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a picture first." };
  const ext = PICTURE_TYPES[file.type];
  if (!ext) return { error: "Use a JPG, PNG or WebP picture." };
  if (file.size > MAX_PICTURE_BYTES) return { error: "That picture is over 5 MB — save a smaller copy and try again." };

  const { data: current } = await who.supabase.from("login_screen").select("image_path").eq("id", true).maybeSingle();
  const path = `login/picture-${Date.now()}.${ext}`;
  const { error: uploadError } = await who.supabase.storage
    .from("site-assets")
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return { error: `The picture wasn't uploaded: ${uploadError.message}` };

  const { data, error } = await who.supabase
    .from("login_screen")
    .update({ image_path: path, updated_at: new Date().toISOString(), updated_by: who.staff.id })
    .eq("id", true)
    .select("id");
  if (error || !data?.length) {
    await who.supabase.storage.from("site-assets").remove([path]);
    return { error: error?.message ?? "The picture wasn't saved." };
  }

  const old = current?.image_path as string | null | undefined;
  if (old && old !== path) await who.supabase.storage.from("site-assets").remove([old]);
  refresh();
  return { success: true };
}

/** Goes back to the picture the app ships with. */
export async function resetLoginPicture(): Promise<Result> {
  const who = await editor();
  if (!who) return { error: "Only a Super Admin can change the login screen." };

  const { data: current } = await who.supabase.from("login_screen").select("image_path").eq("id", true).maybeSingle();
  const { data, error } = await who.supabase
    .from("login_screen")
    .update({ image_path: null, updated_at: new Date().toISOString(), updated_by: who.staff.id })
    .eq("id", true)
    .select("id");
  if (error || !data?.length) return { error: error?.message ?? "The picture wasn't reset." };

  const old = current?.image_path as string | null | undefined;
  if (old) await who.supabase.storage.from("site-assets").remove([old]);
  refresh();
  return { success: true };
}
