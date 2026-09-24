// Which dashboards a staff member gets, and which opens first.
//
// One per job. Someone holding several roles gets a tab for each, opening on
// the one for their main role (staff.role). Management and Super Admin run
// the company, so they get the overview and a team-wide view of every job.
//
// Pure, so it is unit-tested (scripts/dashboards-test.mjs).

import { staffRoles } from "../auth/roles.ts";
import type { StaffRole } from "../constants.ts";

export type DashboardView =
  | "overview"
  | "sales"
  | "sales_team"
  | "processing"
  | "processing_team"
  | "finance"
  | "leadgen"
  | "social";

export const VIEW_LABELS: Record<DashboardView, string> = {
  overview: "Overview",
  sales: "My sales",
  sales_team: "Sales team",
  processing: "My processing",
  processing_team: "Processing team",
  finance: "Accounts & finance",
  leadgen: "Lead generation",
  social: "Social media & ads",
};

const ORDER: DashboardView[] = ["overview", "sales", "processing", "finance", "leadgen", "social", "sales_team", "processing_team"];

const BY_ROLE: Record<StaffRole, DashboardView[]> = {
  super_admin: ["overview", "sales_team", "processing_team", "finance", "leadgen", "social"],
  management: ["overview", "sales_team", "processing_team", "finance", "leadgen", "social"],
  counselor: ["sales"],
  processing: ["processing"],
  finance: ["finance"],
  marketing: ["leadgen"],
  digital_marketing: ["social"],
};

/** The dashboards this person gets, the one for their main role first. */
export function viewsFor(staff: Parameters<typeof staffRoles>[0]): DashboardView[] {
  const roles = staffRoles(staff);
  if (roles.length === 0) return [];
  const main = staff?.role as StaffRole | undefined;
  const primary = main && roles.includes(main) ? main : roles[0];
  const held = new Set(roles.flatMap((r) => BY_ROLE[r] ?? []));
  const first = BY_ROLE[primary]?.[0];
  return [...ORDER.filter((v) => v === first), ...ORDER.filter((v) => v !== first && held.has(v))];
}

/** The view asked for, if they have it; otherwise the one that opens first. */
export function pickView(available: DashboardView[], requested: string | null | undefined): DashboardView | null {
  if (requested && available.includes(requested as DashboardView)) return requested as DashboardView;
  return available[0] ?? null;
}
