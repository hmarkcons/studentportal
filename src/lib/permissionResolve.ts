// Whether one staff member holds a permission, from the tables — for asking
// about somebody OTHER than the person signed in.
//
// getEffectivePermissions() answers for the viewer, and staff_has_permission()
// in SQL answers for auth.uid(). Neither can answer "who should be emailed
// about this leave request?", which has to ask about everyone. This is that
// question, and it follows the same rules exactly (0095, 0247):
//
//   - a Super Admin holds everything;
//   - a staff-level override is set for that one person and wins outright;
//   - otherwise each role they hold is resolved on its own — its override if
//     it has one, else whether the permission's default roles name it — and
//     any "yes" wins.
//
// Pure, so it is unit-tested (scripts/permission-resolve-test.mjs).

export type PermissionTables = {
  definition: { key: string; default_roles: readonly string[] } | null;
  roleOverrides: readonly { role: string; permission_key: string; allowed: boolean }[];
  staffOverrides: readonly { staff_id: string; permission_key: string; allowed: boolean }[];
};

export function holdsPermission(
  staff: { id: string; roles: readonly string[] },
  key: string,
  tables: PermissionTables
): boolean {
  if (staff.roles.includes("super_admin")) return true;

  const own = tables.staffOverrides.find((o) => o.staff_id === staff.id && o.permission_key === key);
  if (own) return own.allowed;

  if (!tables.definition) return false;
  return staff.roles.some((role) => {
    const override = tables.roleOverrides.find((o) => o.role === role && o.permission_key === key);
    return override ? override.allowed : tables.definition!.default_roles.includes(role);
  });
}
