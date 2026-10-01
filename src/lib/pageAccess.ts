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
//   /waiting         the dashboard's Waiting on you, in full: it lists only
//                    what the viewer can see and whose job it is (RLS, then
//                    queueScope), so a role with nothing waiting finds it empty;
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

/**
 * Pages whose only job is changing something, and what changing it takes —
 * any one of the listed permissions. On these, the "page.*" switch alone is
 * not enough: a role that may open the page but not edit it would be shown a
 * builder it cannot use, so the page leaves its menu and refuses its address.
 *
 * Switched off on 23 September for some roles (the travel guides for
 * Processing, the visa and message settings for Management, commissions and
 * payroll for Finance) while the pages stayed in their menus — which is what
 * this closes.
 *
 * A reference page people read — Destinations, Universities, Scholarship
 * bodies, Inventory, Referrals, University Commissions — is not listed: its
 * "page.*" switch alone decides, and it shows read-only to anyone who cannot
 * change it.
 */
export const PAGE_EDIT_PERMISSIONS: Record<string, readonly string[]> = {
  "/setup/travel-guide": ["settings.travel_guide"],
  "/setup/visa-messages": ["settings.visa_messages"],
  "/setup/visa-offices": ["settings.visa_offices"],
  "/setup/visa-page-builder": ["settings.visa_page"],
  "/setup/reengagement-messages": ["settings.reengagement_messages"],
  "/setup/create-doc-checklist": ["document_checklist.manage"],
  "/setup/document-trackers": ["document_trackers.manage"],
  "/setup/attendance-policy": ["attendance.qr_admin"],
  "/setup/office-network": ["staff.approve_offsite_access"],
  "/finance/staff-commission": ["finance.commissions.manage"],
  "/finance/payroll": ["finance.commissions.manage"],
  "/finance/invoice-generator": ["finance.invoices.manage"],
  "/finance/refunds": ["finance.refunds.manage", "finance.refunds.review"],
  "/marketing/broadcast": ["messages.broadcast"],
};

function longestPrefix(path: string, prefixes: readonly string[]): string | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let best: string | null = null;
  for (const prefix of prefixes) {
    if ((clean === prefix || clean.startsWith(`${prefix}/`)) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best;
}

/** What editing a path takes, when it is an editor-only page; null otherwise. */
export function editPermissionsForPath(path: string): readonly string[] | null {
  const best = longestPrefix(path, Object.keys(PAGE_EDIT_PERMISSIONS));
  return best ? PAGE_EDIT_PERMISSIONS[best] : null;
}

/**
 * Why a path is refused, as the permission keys that would open it: its
 * "page.*" key when that is off, else the editing permissions it lacks — for
 * the page to name them. Empty when it is not refused.
 */
export function missingForPath(path: string, perms: Readonly<Record<string, boolean>>, isSuperAdmin: boolean): string[] {
  if (isSuperAdmin) return [];
  const key = permissionForPath(path);
  if (key !== null && perms[key] !== true) return [key];
  const edit = editPermissionsForPath(path);
  if (edit && !edit.some((k) => perms[k] === true)) return [...edit];
  return [];
}

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
 * May someone with these permissions open this path? Its "page.*" switch, and
 * on an editor-only page (PAGE_EDIT_PERMISSIONS) a permission to edit it.
 *
 * A Super Admin may open everything, whatever the table holds — the same rule
 * staff_has_permission() applies in SQL, and the one that keeps a Super Admin
 * from being locked out if a permission row were ever missing.
 */
export function canOpenPath(path: string, perms: Readonly<Record<string, boolean>>, isSuperAdmin: boolean): boolean {
  return missingForPath(path, perms, isSuperAdmin).length === 0;
}
