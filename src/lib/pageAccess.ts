// Which permission opens which staff page — the one table the menu and the
// pages both read, so what the menu offers and what the page allows cannot
// disagree.
//
// Each key is a "page.*" permission (0273, and 0278 for the login screen) on the Role Permissions screen,
// with default roles set per job; a Super Admin holds every one. A path is
// matched by its longest registered prefix, so /students/<id> is governed by
// /students, and /setup/universities/<id> by /setup/universities.
//
// Not listed, deliberately:
//   /dashboard       where everyone lands after signing in — gating it could
//                    lock someone out of the portal altogether;
//   /my-leave        everyone's own leave;
//   /my-agreement    their own agreement, offered only when they have one;
//   /admin/staff     everyone's: the Super Admin manages every record there,
//                    anyone else sees only their own, read-only;
//   /admin/leave     governed by leave.approve;
//   /admin/permissions  Super Admin only, hard-coded so it can never be
//                    switched off and lock every admin out of this screen.
//
// Pure, so it is unit-tested (scripts/page-access-test.mjs).

export const PAGE_PERMISSIONS: Record<string, string> = {
  "/leads": "page.leads",
  "/students": "page.students",
  "/applications": "page.applications",
  "/calendar": "page.calendar",
  "/support": "page.support",
  "/inventory": "page.inventory",

  "/setup/destinations": "page.setup.destinations",
  "/setup/universities": "page.setup.universities",
  "/setup/scholarship-bodies": "page.setup.scholarship_bodies",
  "/setup/agreement-templates": "page.setup.agreement_templates",
  "/setup/agreement-generator": "page.setup.agreement_generator",
  "/setup/document-trackers": "page.setup.document_trackers",
  "/setup/create-doc-checklist": "page.setup.create_doc_checklist",
  "/setup/invoice-settings": "page.setup.invoice_settings",
  "/setup/attendance-policy": "page.setup.attendance_policy",
  "/setup/office-network": "page.setup.office_network",
  "/setup/visa-page-builder": "page.setup.visa_page_builder",
  "/setup/visa-offices": "page.setup.visa_offices",
  "/setup/visa-messages": "page.setup.visa_messages",
  "/setup/reengagement-messages": "page.setup.reengagement_messages",
  "/setup/travel-guide": "page.setup.travel_guide",
  "/setup/support-faqs": "page.setup.support_faqs",
  "/setup/guide-videos": "page.setup.guide_videos",
  "/setup/login-screen": "page.setup.login_screen",

  "/finance/invoice-generator": "page.finance.invoice_generator",
  "/finance/staff-commission": "page.finance.staff_commission",
  "/finance/refunds": "page.finance.refunds",
  "/finance/consultancy-fee": "page.finance.consultancy_fee",
  "/finance/payroll": "page.finance.payroll",
  "/finance/partner-commissions": "page.finance.partner_commissions",
  "/marketing/referrals": "page.marketing.referrals",

  "/marketing/campaigns": "page.marketing.campaigns",
  "/marketing/social-calendar": "page.marketing.social_calendar",
  "/marketing/ad-campaigns": "page.marketing.ad_campaigns",
  "/marketing/broadcast": "page.marketing.broadcast",

  "/reports": "page.reports",

  "/admin/attendance": "page.admin.attendance",
  "/admin/message-templates": "page.admin.message_templates",
  "/admin/audit-log": "page.admin.audit_log",
  "/admin/additional-services": "page.admin.additional_services",
};

/** The permission governing a path, or null when the page is not gated this way. */
export function permissionForPath(path: string): string | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let best: string | null = null;
  for (const prefix of Object.keys(PAGE_PERMISSIONS)) {
    if ((clean === prefix || clean.startsWith(`${prefix}/`)) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best ? PAGE_PERMISSIONS[best] : null;
}

/**
 * May someone with these permissions open this path?
 *
 * A Super Admin may open everything, whatever the table holds — the same rule
 * staff_has_permission() applies in SQL, and the one that keeps a Super Admin
 * from being locked out if a permission row were ever missing.
 */
export function canOpenPath(path: string, perms: Readonly<Record<string, boolean>>, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  const key = permissionForPath(path);
  return key === null || perms[key] === true;
}
