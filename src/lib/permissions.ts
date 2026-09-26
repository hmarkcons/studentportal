// "Major functionality" permission keys — must match the `key` column
// seeded in supabase/migrations/0094_role_permission_overrides.sql exactly.
// Labels/descriptions/categories/default_roles live in the DB (single
// source of truth for the admin UI + staff_has_permission()); this file
// only fixes the key strings at compile time so call sites can't typo them.
export const PERMISSION_KEYS = [
  // Adding, editing and removing staff, their roles included: the Super
  // Admin's alone, and not grantable to anyone else (0283, 0284) — see
  // SUPER_ADMIN_ONLY_PERMISSIONS below.
  "staff.manage",
  "staff.approve_offsite_access",
  // Staff contracts (0271): wording, and issuing/filing. No default roles —
  // a Super Admin's until granted to a role on the Role Permissions screen.
  "staff_agreements.templates",
  "staff_agreements.manage",
  // Staff leave (0272): Management and Super Admin by default.
  "leave.approve",
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
  "document_checklist.manage",
  "documents.manage_requirements",
  "interviews.manage",
  "messages.broadcast",
  "marketing.referral_incentives",
  "marketing.referrals.manage",
  "settings.visa_messages",
  "settings.visa_offices",
  "settings.visa_page",
  "settings.travel_guide",
  "students.restart_process",
  "settings.reengagement_messages",
  "inventory.manage",
] as const;

/**
 * Permissions a Super Admin holds and nobody else can be given: they are left
 * off the Role Permissions screen and the per-person panel, and the database
 * refuses an override for them (0284). Who manages staff — and so who decides
 * anyone's roles — is not a switch.
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly string[] = ["staff.manage"];

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
