import { cache } from "react";
import { getStaffSession } from "./session";
import { getCurrentUser } from "./currentUser";
import { createClient } from "@/lib/supabase/server";
import { staffRoles } from "./roles";
import type { PermissionKey } from "@/lib/permissions";

// Effective permissions for the CURRENT staff member: Super Admin always
// gets everything; anyone else gets the seeded default_roles for each key,
// unless Super Admin has set a role-level override (see /admin/permissions)
// — and a staff-level override, set for that one person specifically, wins
// over both. Cached per request the same way getStaffSession is, since a
// page can need several of these checks.
export const getEffectivePermissions = cache(async (): Promise<Record<string, boolean>> => {
  // Everything it reads is asked for at once, beside the staff row rather than
  // after it: none of it depends on the roles, only on who is signed in, which
  // the token already says. It used to wait for the staff row, then the
  // definitions, then the overrides — three waves every page stood behind.
  const user = await getCurrentUser();
  if (!user) return {};
  const supabase = await createClient();
  const [{ staff }, { data: defs }, { data: roleOverrides }, { data: staffOverrides }] = await Promise.all([
    getStaffSession(),
    supabase.from("permission_definitions").select("key, default_roles"),
    // A handful of rows in all; only this person's roles are looked up below.
    supabase.from("role_permission_overrides").select("role, permission_key, allowed"),
    supabase.from("staff_permission_overrides").select("permission_key, allowed").eq("staff_id", user.id),
  ]);
  if (!staff || !defs) return {};

  // Every role this person holds, not just their primary one (0247).
  const roles = staffRoles(staff);

  if (roles.includes("super_admin")) {
    return Object.fromEntries(defs.map((d) => [d.key, true]));
  }

  // Keyed by role AND key, because the same key can be overridden differently
  // for two roles the same person holds.
  const roleOverrideMap = new Map(
    (roleOverrides ?? []).map((o) => [`${o.role}::${o.permission_key}`, o.allowed])
  );
  const staffOverrideMap = new Map((staffOverrides ?? []).map((o) => [o.permission_key, o.allowed]));

  const result: Record<string, boolean> = {};
  for (const d of defs) {
    // A staff-level override is set for this one person and wins outright,
    // exactly as before.
    if (staffOverrideMap.has(d.key)) {
      result[d.key] = staffOverrideMap.get(d.key)!;
      continue;
    }

    // Otherwise each role is resolved on its own — its override if it has one,
    // else whether the key's defaults name it — and the answers are OR'd.
    //
    // Most permissive wins, deliberately. Roles are additive: somebody who is
    // both Counselor and Finance should be able to do both jobs. If a deny on
    // one role could veto an allow on another, then ADDING a role could take
    // access away, which is the opposite of what granting a role means and
    // impossible to reason about from the Role Permissions screen.
    //
    // For a person with one role this is identical to the previous behaviour,
    // which is what makes it safe to roll out: nobody's access changes until
    // somebody is actually given a second role.
    result[d.key] = roles.some((role) => {
      const key = `${role}::${d.key}`;
      return roleOverrideMap.has(key)
        ? roleOverrideMap.get(key)!
        : (d.default_roles as string[]).includes(role);
    });
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
