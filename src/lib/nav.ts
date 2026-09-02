import type { NavItem } from "@/components/AppShell";

// Every item below is visible to every active staff role today — the app's
// real access control lives in per-page/per-action permission checks (see
// src/lib/auth/permissions.ts), not the nav. The two exceptions are wired up
// explicitly in buildStaffNav below: Staff Management (needs staff.manage)
// and Role Permissions (Super Admin only, hardcoded so it can never be
// overridden away and lock every admin out of the permissions screen).
const BASE_STAFF_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "🏠" },
  { label: "Leads", href: "/leads", icon: "📇" },
  { label: "Students", href: "/students", icon: "🎓" },
  { label: "Applications", href: "/applications", icon: "🗂️" },
  { label: "Calendar", href: "/calendar", icon: "📅" },
  { label: "Support Tickets", href: "/support", icon: "🎧" },
  { label: "Inventory", href: "/inventory", icon: "📦" },
  {
    label: "Setup",
    icon: "⚙️",
    children: [
      { label: "Destinations", href: "/setup/destinations" },
      { label: "Universities", href: "/setup/universities" },
      { label: "Scholarship bodies", href: "/setup/scholarship-bodies" },
      { label: "Agreement templates", href: "/setup/agreement-templates" },
      { label: "Agreement generator", href: "/setup/agreement-generator" },
      { label: "Document trackers", href: "/setup/document-trackers" },
    ],
  },
  {
    label: "Accounts & Finance",
    icon: "💰",
    children: [
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
    icon: "📣",
    children: [
      { label: "Campaigns", href: "/marketing/campaigns" },
      { label: "Social calendar", href: "/marketing/social-calendar" },
      { label: "Ad campaigns", href: "/marketing/ad-campaigns" },
      { label: "Broadcast message", href: "/marketing/broadcast" },
    ],
  },
  { label: "Reports", href: "/reports", icon: "📊" },
  {
    label: "HR",
    icon: "👥",
    children: [
      { label: "Staff Management", href: "/admin/staff" },
      { label: "Attendance", href: "/admin/attendance" },
      { label: "Message templates", href: "/admin/message-templates" },
    ],
  },
  {
    label: "Admin",
    icon: "🛠️",
    children: [
      { label: "Audit log", href: "/admin/audit-log" },
      { label: "Additional services", href: "/admin/additional-services" },
    ],
  },
];

export function buildStaffNav({ canManageStaff, isSuperAdmin }: { canManageStaff: boolean; isSuperAdmin: boolean }): NavItem[] {
  return BASE_STAFF_NAV.map((item) => {
    if (item.label === "HR" && item.children) {
      const children = canManageStaff ? item.children : item.children.filter((c) => c.label !== "Staff Management");
      return { ...item, children };
    }
    if (item.label === "Admin" && item.children && isSuperAdmin) {
      return { ...item, children: [...item.children, { label: "Role Permissions", href: "/admin/permissions" }] };
    }
    return item;
  });
}

export const STUDENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/portal", icon: "🏠" },
  { label: "Profile", href: "/portal/profile", icon: "👤" },
  { label: "Documents", href: "/portal/documents", icon: "📁" },
  { label: "Appointments", href: "/portal/appointments", icon: "📅" },
  { label: "Payments", href: "/portal/payments", icon: "💳" },
  { label: "Agreement", href: "/portal/agreement", icon: "📄" },
  { label: "Messages", href: "/portal/messages", icon: "💬" },
  { label: "Support", href: "/portal/support", icon: "🎧" },
  { label: "Guide", href: "/portal/guide", icon: "🎬" },
];

export const PARTNER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/partner", icon: "🏠" },
  { label: "Programs", href: "/partner/programs", icon: "📚" },
  { label: "Commissions", href: "/partner/commissions", icon: "💰" },
  { label: "Documents", href: "/partner/documents", icon: "📁" },
  { label: "Reports", href: "/partner/reports", icon: "📊" },
  { label: "Agreement", href: "/partner/agreement", icon: "📄" },
];
