// Who to put in a per-counselor report, and which month a registration
// belongs to.
//
// The counselor reports selected staff with role='counselor' and matched leads
// against them. On the live data that means the tables covered 7 of 22 leads
// and 6 of 17 registrations: 12 leads are assigned to management, super_admin
// or digital_marketing staff, and 3 to nobody at all. Two-thirds of the
// business was missing from "Counselor-wise performance" and from the monthly
// registrations grid, silently — the rows that were shown looked complete.
//
// So the reports are built around whoever actually holds leads, not around a
// role. Everyone with a lead appears, tagged with their real role so a row
// that is not a counselor is obviously not one, plus an Unassigned row when
// leads are sitting with nobody. Active counselors with no leads yet are kept
// so a new joiner shows up at 0 rather than vanishing, and a deactivated staff
// member who still holds history stays visible and marked — dropping them
// would delete their registrations from last month's totals.

import type { StaffRole } from "./constants";

export const UNASSIGNED_ID = "unassigned";

export type StaffLike = {
  id: string;
  full_name: string;
  role?: StaffRole | string | null;
  status?: string | null;
  monthly_target?: number | string | null;
};

export type LeadLike = {
  assigned_counselor_id?: string | null;
  registered_at?: string | null;
};

export type LeadOwner = {
  id: string;
  name: string;
  role: string | null;
  /** null for the Unassigned row and for staff no longer on file. */
  status: string | null;
  /** The staff member's own target, when one is set. */
  monthlyTarget: number | null;
  isUnassigned: boolean;
  /** True when they hold leads but are not a counselor by role. */
  isOtherRole: boolean;
  /** True when they hold leads but are no longer active staff. */
  isInactive: boolean;
};

function targetOf(v: StaffLike["monthly_target"]): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The rows a per-counselor report should show, in the order to show them:
 * whoever has the most registrations first, with Unassigned always last
 * because it is a gap to close rather than a performer.
 */
export function buildLeadOwners(staff: StaffLike[], leads: LeadLike[]): LeadOwner[] {
  const held = new Map<string, number>();
  const registered = new Map<string, number>();
  let unassignedCount = 0;

  for (const l of leads) {
    const id = l.assigned_counselor_id ?? null;
    if (!id) {
      unassignedCount += 1;
      continue;
    }
    held.set(id, (held.get(id) ?? 0) + 1);
    if (l.registered_at) registered.set(id, (registered.get(id) ?? 0) + 1);
  }

  const byId = new Map(staff.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const id of held.keys()) ids.add(id);
  for (const s of staff) {
    if (s.role === "counselor" && s.status === "active") ids.add(s.id);
  }

  const owners: LeadOwner[] = [...ids].map((id) => {
    const s = byId.get(id);
    return {
      id,
      // A lead pointing at a staff row that no longer exists still has to be
      // counted somewhere, or the report stops reconciling with the leads list.
      name: s?.full_name ?? "Former staff member",
      role: (s?.role as string) ?? null,
      status: s?.status ?? null,
      monthlyTarget: targetOf(s?.monthly_target),
      isUnassigned: false,
      isOtherRole: Boolean(s) && s!.role !== "counselor",
      isInactive: !s || s.status !== "active",
    };
  });

  owners.sort(
    (a, b) =>
      (registered.get(b.id) ?? 0) - (registered.get(a.id) ?? 0) ||
      (held.get(b.id) ?? 0) - (held.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name)
  );

  if (unassignedCount > 0) {
    owners.push({
      id: UNASSIGNED_ID,
      name: "Unassigned",
      role: null,
      status: null,
      monthlyTarget: null,
      isUnassigned: true,
      isOtherRole: false,
      isInactive: false,
    });
  }

  return owners;
}

/** The key a lead's assignment counts under, so unassigned leads still count. */
export function ownerKey(lead: LeadLike): string {
  return lead.assigned_counselor_id ?? UNASSIGNED_ID;
}

const KARACHI = "Asia/Karachi";

/**
 * The yyyy-mm a timestamp falls in, in Karachi.
 *
 * Bucketing used the server's clock via getMonth(), and the server is UTC —
 * so a student registered between midnight and 5am Karachi time was counted in
 * the previous month, on the last day of which it still was in UTC. The office
 * is in Karachi and the month boundary that matters is theirs.
 */
export function karachiMonthKey(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: KARACHI }).slice(0, 7);
}

export type ReportMonth = { key: string; label: string };

/**
 * The last `count` months ending with the current Karachi month, oldest first.
 * Locale is pinned as well as timezone: an unpinned label renders in whatever
 * locale the server happens to have, which is not the reader's either.
 */
export function recentMonths(count: number, now: Date = new Date()): ReportMonth[] {
  const [year, month] = now.toLocaleDateString("en-CA", { timeZone: KARACHI }).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    };
  });
}
