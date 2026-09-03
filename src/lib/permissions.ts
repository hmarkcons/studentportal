// "Major functionality" permission keys — must match the `key` column
// seeded in supabase/migrations/0094_role_permission_overrides.sql exactly.
// Labels/descriptions/categories/default_roles live in the DB (single
// source of truth for the admin UI + staff_has_permission()); this file
// only fixes the key strings at compile time so call sites can't typo them.
export const PERMISSION_KEYS = [
  "staff.manage",
  "partners.approve",
  "attendance.qr_admin",
  "finance.commissions.manage",
  "finance.partner_commissions.delete",
  "finance.program_rates.manage",
  "finance.invoices.manage",
  "finance.invoices.delete",
  "finance.refunds.manage",
  "finance.refunds.review",
  "leads.delete",
  "agreements.process",
  "agreements.edit_delete",
  "scholarships.manage",
  "document_trackers.manage",
  "inventory.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
