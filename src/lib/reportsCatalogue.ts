import type { StaffRole } from "./constants";

export type ReportCatalogueEntry = {
  href: string;
  label: string;
  description: string;
  roles: StaffRole[];
};

// Role-based visibility per the doc's "each role sees only the KPIs
// relevant to them" — Super Admin always sees everything.
export const REPORT_CATALOGUE: ReportCatalogueEntry[] = [
  {
    href: "/reports/counselor-performance",
    label: "Counselor-wise performance",
    description: "Leads assigned, registrations, and conversion rate per counselor.",
    roles: ["super_admin", "management", "counselor"],
  },
  {
    href: "/reports/monthly-registrations",
    label: "Monthly registrations",
    description: "Registrations per counselor, by month.",
    roles: ["super_admin", "management", "counselor", "finance"],
  },
  {
    href: "/reports/university-success",
    label: "University-wise application/success rate",
    description: "Applications, enrollments, and rejections per university.",
    roles: ["super_admin", "management", "processing"],
  },
  {
    href: "/reports/visa-approval",
    label: "Visa approval rate by country",
    description: "Approved / rejected / RFE breakdown per destination.",
    roles: ["super_admin", "management", "processing"],
  },
  {
    href: "/reports/document-turnaround",
    label: "Document turnaround time",
    description: "Average time from submission to verification, by category.",
    roles: ["super_admin", "management", "processing"],
  },
  {
    href: "/reports/revenue-commission",
    label: "Revenue & commission",
    description: "Invoiced revenue, collections, and commission totals.",
    roles: ["super_admin", "management", "finance"],
  },
  {
    href: "/reports/staff-commission",
    label: "Staff commission report",
    description: "Paid vs. unpaid commission totals per staff member.",
    roles: ["super_admin", "finance"],
  },
  {
    href: "/reports/refunds",
    label: "Refund report",
    description: "Refund requests by status and total amounts.",
    roles: ["super_admin", "management", "finance"],
  },
  {
    href: "/reports/marketing-roi",
    label: "Marketing channel ROI",
    description: "Cost-per-lead and lead-source performance per campaign.",
    roles: ["super_admin", "management", "marketing", "digital_marketing"],
  },
];

export function visibleReports(role: StaffRole | undefined) {
  if (!role) return [];
  if (role === "super_admin") return REPORT_CATALOGUE;
  return REPORT_CATALOGUE.filter((r) => r.roles.includes(role));
}
