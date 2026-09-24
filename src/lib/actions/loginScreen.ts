"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";
import { parseLoginFigures } from "@/lib/loginFigures";

/**
 * Saves the login screen's figures (Setup → Login screen).
 *
 * The permission is checked here as well as by RLS (0278), because a write
 * RLS refuses raises nothing — it would report success over a change that
 * never happened. The new set is written before the old one is removed, so a
 * failure part-way leaves the old figures on the screen rather than none.
 */
export async function saveLoginFigures(_prev: unknown, formData: FormData) {
  const { supabase, staff } = await getStaffSession();
  // Whoever may open the page may save it: the same rule as its guard.
  if (!staff || !canOpenPath("/setup/login-screen", await getEffectivePermissions(), hasRole(staff, "super_admin"))) {
    return { error: "Only a Super Admin can change the login screen." };
  }

  const parsed = parseLoginFigures((name) => formData.get(name));
  if ("error" in parsed) return { error: parsed.error };

  const { data: old } = await supabase.from("login_figures").select("id");
  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("login_figures")
    .insert(parsed.figures.map((f, i) => ({ sort_order: i + 1, value: f.value, label: f.label, icon: f.icon, updated_at: now, updated_by: staff.id })))
    .select("id");
  if (insertError || (inserted ?? []).length !== parsed.figures.length) {
    return { error: insertError?.message ?? "The figures weren't saved." };
  }
  const oldIds = (old ?? []).map((r) => r.id as string);
  if (oldIds.length) {
    const { error: deleteError } = await supabase.from("login_figures").delete().in("id", oldIds);
    if (deleteError) return { error: deleteError.message };
  }

  revalidateTag("login-figures", { expire: 0 });
  revalidatePath("/login");
  revalidatePath("/setup/login-screen");
  return { success: true };
}
