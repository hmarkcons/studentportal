import type { NavItem } from "@/components/AppShell";
import { canOpenPath } from "./pageAccess.ts";

// Everything a staff member might use. buildStaffNav below keeps only what
// their roles may open: each page's "page.*" permission (src/lib/pageAccess.ts,
// 0273) decides, and the same rule guards the page itself, so the menu never
// offers a page that would refuse them. A section with nothing left in it is
// left out altogether. Staff Management, Leave and Role Permissions keep the
// rules they always had, wired up explicitly below.
const BASE_STAFF_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Leads", href: "/leads", icon: "leads" },
  { label: "Students", href: "/students", icon: "students" },
  { label: "Applications", href: "/applications", icon: "applications" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Support Tickets", href: "/support", icon: "support" },
  { label: "Inventory", href: "/inventory", icon: "inventory" },
  {
    label: "Setup",
    icon: "setup",
    children: [
      { label: "Destinations", href: "/setup/destinations" },
      { label: "Universities", href: "/setup/universities" },
      { label: "Scholarship bodies", href: "/setup/scholarship-bodies" },
      { label: "Agreement templates", href: "/setup/agreement-templates" },
      { label: "Agreement generator", href: "/setup/agreement-generator" },
      { label: "Document trackers", href: "/setup/document-trackers" },
      { label: "Create Doc Checklist", href: "/setup/create-doc-checklist" },
      { label: "Invoice settings", href: "/setup/invoice-settings" },
      { label: "Attendance policy", href: "/setup/attendance-policy" },
      { label: "Office network", href: "/setup/office-network" },
      { label: "Visa page builder", href: "/setup/visa-page-builder" },
      { label: "Visa offices", href: "/setup/visa-offices" },
      { label: "Visa messages", href: "/setup/visa-messages" },
      { label: "Re-engagement messages", href: "/setup/reengagement-messages" },
      { label: "Travel & arrival guides", href: "/setup/travel-guide" },
      { label: "Support FAQ", href: "/setup/support-faqs" },
      { label: "Guide tutorials", href: "/setup/guide-videos" },
      { label: "Login screen", href: "/setup/login-screen" },
    ],
  },
  {
    label: "Accounts & Finance",
    icon: "finance",
    children: [
      { label: "Invoice Generator", href: "/finance/invoice-generator" },
      { label: "Staff Commission", href: "/finance/staff-commission" },
      { label: "Refunds", href: "/finance/refunds" },
      { label: "Consultancy Fee", href: "/finance/consultancy-fee" },
      { label: "Payroll", href: "/finance/payroll" },
      { label: "University Commissions", href: "/finance/partner-commissions" },
      { label: "Referrals", href: "/marketing/referrals" },
    ],
  },
  {
    label: "Marketing",
    icon: "marketing",
    children: [
      { label: "Campaigns", href: "/marketing/campaigns" },
      { label: "Social calendar", href: "/marketing/social-calendar" },
      { label: "Ad campaigns", href: "/marketing/ad-campaigns" },
      { label: "Broadcast message", href: "/marketing/broadcast" },
    ],
  },
  { label: "Reports", href: "/reports", icon: "reports" },
  {
    label: "HR",
    icon: "people",
    children: [
      { label: "Staff Management", href: "/admin/staff" },
      { label: "Attendance", href: "/admin/attendance" },
      { label: "Message templates", href: "/admin/message-templates" },
    ],
  },
  {
    label: "Admin",
    icon: "admin",
    children: [
      { label: "Audit log", href: "/admin/audit-log" },
      { label: "Additional services", href: "/admin/additional-services" },
    ],
  },
];

export function buildStaffNav({
  isSuperAdmin,
  hasOwnAgreement = false,
  canApproveLeave = false,
  perms = {},
}: {
  isSuperAdmin: boolean;
  /** An agreement has been sent to this staff member — only then is "My agreement" worth a link. */
  hasOwnAgreement?: boolean;
  /** leave.approve — Management and Super Admin by default. */
  canApproveLeave?: boolean;
  /** The viewer's effective permissions, for the "page.*" keys. */
  perms?: Readonly<Record<string, boolean>>;
}): NavItem[] {
  const allowed = (href: string) => canOpenPath(href, perms, isSuperAdmin);
  const shaped = BASE_STAFF_NAV.map((item) => {
    if (item.label === "HR" && item.children) {
      // Staff Management is everyone's: the Super Admin manages every record
      // there, and anyone else sees their own details, read-only — so for
      // them it says what it is, "My profile", rather than offering to manage
      // staff they cannot manage.
      // Everyone has leave of their own; approvers also get the list to decide.
      const children = [
        ...item.children.map((c) =>
          c.href === "/admin/staff" && !isSuperAdmin ? { ...c, label: "My profile" } : c
        ),
        ...(canApproveLeave ? [{ label: "Leave", href: "/admin/leave" }] : []),
        { label: "My leave", href: "/my-leave" },
        ...(hasOwnAgreement ? [{ label: "My agreement", href: "/my-agreement" }] : []),
      ];
      return { ...item, children };
    }
    if (item.label === "Admin" && item.children && isSuperAdmin) {
      return { ...item, children: [...item.children, { label: "Role Permissions", href: "/admin/permissions" }] };
    }
    return item;
  });

  return shaped
    .map((item) => (item.children ? { ...item, children: item.children.filter((c) => allowed(c.href)) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : !item.href || allowed(item.href)));
}

// The student menu is built in studentNav.ts: which entries a student gets
// depends on where they are going and how far they have got.

export const PARTNER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/partner", icon: "dashboard" },
  { label: "Programs", href: "/partner/programs", icon: "programs" },
  { label: "Calendar", href: "/partner/calendar", icon: "calendar" },
  { label: "Commissions", href: "/partner/commissions", icon: "commissions" },
  { label: "Documents", href: "/partner/documents", icon: "documents" },
  { label: "Reports", href: "/partner/reports", icon: "reports" },
  { label: "Agreement", href: "/partner/agreement", icon: "agreement" },
];
