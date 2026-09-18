// Relative, not "@/lib/constants", on purpose: scripts/*-test.mjs import
// src/lib modules directly under plain Node, which has no TypeScript path
// aliases. Every unit-tested module here is alias-free for that reason, and
// this file is now in that chain via leadOwners.
import { STAFF_ROLES, type StaffRole } from "../constants.ts";

/**
 * Which roles a staff member holds.
 *
 * staff.roles is the authority; staff.role is the primary one and is always a
 * member of that set (a database trigger keeps them in step — see 0247). This
 * falls back to the primary so a caller that loaded only `role` still gets a
 * correct answer rather than an empty set, which would read as "no access".
 */
/**
 * The input is deliberately loose. Several callers hold a staff row typed with
 * `role: string` — report rows, commission options, the staff table — and
 * narrowing them all to StaffRole just to ask a question about them would be
 * casting at every call site instead of once here. What is asked FOR stays
 * strict, so a typo in a role name is still a compile error.
 */
type RoleBearing = { role?: string | null; roles?: (string | null)[] | null } | null;

export function staffRoles(staff: RoleBearing): StaffRole[] {
  if (!staff) return [];
  const set = (staff.roles ?? []).filter((r): r is string => Boolean(r));
  if (set.length > 0) return set as StaffRole[];
  return staff.role ? [staff.role as StaffRole] : [];
}

/**
 * True when the staff member holds ANY of the given roles.
 *
 * This replaces the direct `staff.role === "finance"` comparison that used to
 * appear in 44 places throughout the app. That comparison was
 * correct while a person had exactly one role, and became a bug the moment
 * they could hold several: somebody whose primary role is Counselor but who
 * also holds Finance would have been refused the finance pages their role
 * grants them.
 */
export function hasRole(staff: RoleBearing, ...wanted: StaffRole[]): boolean {
  const held = staffRoles(staff);
  return wanted.some((w) => held.includes(w));
}

/** Super Admin is the one role that also implies every permission. */
export function isSuperAdmin(staff: RoleBearing): boolean {
  return hasRole(staff, "super_admin");
}

/**
 * Whether this person may grant or remove the Super Admin role.
 *
 * Restricted to Super Admin deliberately: anyone who can hand out Super Admin
 * can hand it to themselves, which is full control of the system including the
 * permissions editor. Management can assign every other role.
 */
export function canGrantSuperAdmin(staff: RoleBearing): boolean {
  return isSuperAdmin(staff);
}

/**
 * Marker the staff form posts alongside its role checkboxes.
 *
 * Unticking every box submits no `roles` at all, which is indistinguishable
 * from a form that has no roles field — and the two must be handled
 * differently: the first is a mistake to report back, the second must leave
 * the existing roles alone rather than wipe them.
 */
export const ROLES_PRESENT_FIELD = "roles_present";

export function rolesWereSubmitted(formData: FormData): boolean {
  return formData.get(ROLES_PRESENT_FIELD) !== null;
}

/**
 * The submitted roles, in STAFF_ROLES order, deduplicated, and with anything
 * that isn't a real role dropped — a hand-crafted POST can't reach the enum
 * column with a value it would refuse, or slip a role past the checks below
 * by spelling it differently.
 */
export function parseRolesFromFormData(formData: FormData): StaffRole[] {
  const raw = new Set(formData.getAll("roles").map((v) => String(v)));
  return STAFF_ROLES.filter((r) => raw.has(r));
}
