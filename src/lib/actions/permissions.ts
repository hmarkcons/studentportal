"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/lib/permissions";
import type { StaffRole } from "@/lib/constants";

// Deliberately NOT routed through requirePermission()/staff_has_permission —
// this screen controls every other permission, so its own gate must stay a
// hardcoded super_admin check. Making it overridable would let Super Admin
// accidentally revoke everyone's (including their own role's, if ever
// changed) access to the one screen that could undo that.
async function requireSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  return staffRow?.role === "super_admin";
}

export async function setRolePermissionOverride(role: StaffRole, key: PermissionKey, allowed: boolean) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can change role permissions." };
  if (role === "super_admin") return { error: "Super Admin always has full access and can't be changed." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("role_permission_overrides").upsert(
    { role, permission_key: key, allowed, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "role,permission_key" }
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/permissions");
  return { success: true };
}

export async function resetRolePermissionOverride(role: StaffRole, key: PermissionKey) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can change role permissions." };

  const { error } = await supabase.from("role_permission_overrides").delete().eq("role", role).eq("permission_key", key);
  if (error) return { error: error.message };

  revalidatePath("/admin/permissions");
  return { success: true };
}

async function assertNotSuperAdmin(supabase: Awaited<ReturnType<typeof createClient>>, staffId: string) {
  const { data: row } = await supabase.from("staff").select("role").eq("id", staffId).maybeSingle();
  return row?.role !== "super_admin";
}

export async function setStaffPermissionOverride(staffId: string, key: PermissionKey, allowed: boolean) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can change staff permissions." };
  if (!(await assertNotSuperAdmin(supabase, staffId))) return { error: "Super Admin always has full access and can't be changed." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("staff_permission_overrides").upsert(
    { staff_id: staffId, permission_key: key, allowed, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "staff_id,permission_key" }
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/staff");
  return { success: true };
}

export async function resetStaffPermissionOverride(staffId: string, key: PermissionKey) {
  const supabase = await createClient();
  if (!(await requireSuperAdmin(supabase))) return { error: "Only Super Admin can change staff permissions." };

  const { error } = await supabase.from("staff_permission_overrides").delete().eq("staff_id", staffId).eq("permission_key", key);
  if (error) return { error: error.message };

  revalidatePath("/admin/permissions");
  revalidatePath("/admin/staff");
  return { success: true };
}
