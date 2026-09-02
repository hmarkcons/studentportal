import { cache } from "react";
import { getStaffSession } from "./session";
import type { PermissionKey } from "@/lib/permissions";

// Effective permissions for the CURRENT staff member's role: Super Admin
// always gets everything; anyone else gets the seeded default_roles for
// each key, unless Super Admin has set an explicit override for their role
// (see /admin/permissions). Cached per request the same way getStaffSession
// is, since a page can need several of these checks.
export const getEffectivePermissions = cache(async (): Promise<Record<string, boolean>> => {
  const { supabase, staff } = await getStaffSession();
  if (!staff) return {};

  const { data: defs } = await supabase.from("permission_definitions").select("key, default_roles");
  if (!defs) return {};

  if (staff.role === "super_admin") {
    return Object.fromEntries(defs.map((d) => [d.key, true]));
  }

  const { data: overrides } = await supabase
    .from("role_permission_overrides")
    .select("permission_key, allowed")
    .eq("role", staff.role);
  const overrideMap = new Map((overrides ?? []).map((o) => [o.permission_key, o.allowed]));

  const result: Record<string, boolean> = {};
  for (const d of defs) {
    result[d.key] = overrideMap.has(d.key) ? overrideMap.get(d.key)! : (d.default_roles as string[]).includes(staff.role);
  }
  return result;
});

export async function hasPermission(key: PermissionKey): Promise<boolean> {
  const perms = await getEffectivePermissions();
  return perms[key] === true;
}

export async function requirePermission(key: PermissionKey, message: string): Promise<{ error: string } | null> {
  return (await hasPermission(key)) ? null : { error: message };
}
