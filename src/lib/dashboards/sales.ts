// The counsellor's dashboard, and the sales team's: leads from enquiry to
// registration. Pure — scripts/dashboards-test.mjs.

import { LEAD_STATUS_LABELS, type LeadStatus } from "../constants.ts";
import type { ReportMonth } from "../leadOwners.ts";
import { percentOf } from "../chartMath.ts";
import { addDays, daysBetween, karachiDay, karachiMonth } from "./dates.ts";

/** Still being worked: a counsellor owes each of these a next contact. */
export const OPEN_STATUSES: LeadStatus[] = [
  "potential",
  "meeting_done",
  "in_discussion",
  "call_later",
  "busy",
  "not_answering",
  "powered_off",
  "repeated_reschedules",
];
/** A meeting has been held, or the lead has gone past one. */
const MET_STATUSES: LeadStatus[] = ["meeting_done", "in_discussion", "repeated_reschedules", "next_intake", "registered"];

/** Waiting for a later intake on purpose — not lost, not being chased now. */
export const PARKED_STATUSES: LeadStatus[] = ["next_intake"];

/**
 * An open lead nobody has spoken to for this long is due a call. The same
 * three days the ghost-chase follow-ups use (CHASE_AFTER_DAYS).
 */
export const FOLLOW_UP_AFTER_DAYS = 3;
/** The window conversion and lead sources are measured over. */
export const RECENT_DAYS = 90;

export type SalesLead = {
  id: string;
  full_name: string | null;
  status: string | null;
  platform_source: string | null;
  created_at: string;
  registered_at: string | null;
  assigned_counselor_id: string | null;
};

export type CallLog = { lead_id: string; created_at: string };

export type FollowUp = { id: string; name: string; status: string; statusLabel: string; daysSince: number };

export type SalesSummary = {
  registeredThisMonth: number;
  registeredLastMonth: number;
  newLeadsThisMonth: number;
  openLeads: number;
  parkedLeads: number;
  /** Open and parked leads by status, in the order the work moves through them. */
  pipeline: { status: string; label: string; count: number }[];
  monthly: { key: string; label: string; newLeads: number; registered: number }[];
  /** Of the leads received in the last RECENT_DAYS, how many are now registered. */
  conversion: { received: number; registered: number; rate: number | null };
  /**
   * The same leads, step by step. Each step is a subset of the one before:
   * a lead that has had a meeting has been contacted, and a registered one
   * has had a meeting.
   */
  funnel: { label: string; value: number }[];
  /** Where the last RECENT_DAYS of leads came from, with how many registered. */
  sources: { source: string; leads: number; registered: number }[];
  followUpsDue: number;
  /** The longest-waiting open leads, oldest contact first. */
  followUps: FollowUp[];
};

const label = (status: string) => LEAD_STATUS_LABELS[status as LeadStatus] ?? status;

export function summarizeSales({
  leads,
  calls,
  months,
  today,
}: {
  leads: SalesLead[];
  calls: CallLog[];
  months: ReportMonth[];
  /** Karachi's today, YYYY-MM-DD. */
  today: string;
}): SalesSummary {
  const thisMonth = today.slice(0, 7);
  const lastMonth = months.length >= 2 ? months[months.length - 2].key : "";
  const since = addDays(today, -RECENT_DAYS);

  const lastContact = new Map<string, string>();
  for (const c of calls) {
    const day = karachiDay(c.created_at);
    if (day && (lastContact.get(c.lead_id) ?? "") < day) lastContact.set(c.lead_id, day);
  }

  const monthly = months.map((m) => ({ key: m.key, label: m.label, newLeads: 0, registered: 0 }));
  const byMonth = new Map(monthly.map((m) => [m.key, m]));
  const pipelineCounts = new Map<string, number>();
  const sources = new Map<string, { leads: number; registered: number }>();
  const followUps: FollowUp[] = [];
  let registeredThisMonth = 0;
  let registeredLastMonth = 0;
  let newLeadsThisMonth = 0;
  let openLeads = 0;
  let parkedLeads = 0;
  let received = 0;
  let receivedRegistered = 0;
  let contacted = 0;
  let met = 0;

  for (const l of leads) {
    const createdMonth = karachiMonth(l.created_at);
    const registeredMonth = l.registered_at ? karachiMonth(l.registered_at) : "";
    const status = l.status ?? "";

    const createdBucket = byMonth.get(createdMonth);
    if (createdBucket) createdBucket.newLeads++;
    const registeredBucket = registeredMonth ? byMonth.get(registeredMonth) : undefined;
    if (registeredBucket) registeredBucket.registered++;
    if (createdMonth === thisMonth) newLeadsThisMonth++;
    if (registeredMonth === thisMonth) registeredThisMonth++;
    if (registeredMonth && registeredMonth === lastMonth) registeredLastMonth++;

    if (OPEN_STATUSES.includes(status as LeadStatus)) {
      openLeads++;
      pipelineCounts.set(status, (pipelineCounts.get(status) ?? 0) + 1);
      const lastSpoke = lastContact.get(l.id) ?? karachiDay(l.created_at);
      const daysSince = lastSpoke ? daysBetween(lastSpoke, today) : 0;
      if (daysSince >= FOLLOW_UP_AFTER_DAYS) {
        followUps.push({ id: l.id, name: l.full_name ?? "Unnamed lead", status, statusLabel: label(status), daysSince });
      }
    } else if (PARKED_STATUSES.includes(status as LeadStatus)) {
      parkedLeads++;
      pipelineCounts.set(status, (pipelineCounts.get(status) ?? 0) + 1);
    }

    if (karachiDay(l.created_at) >= since) {
      received++;
      if (l.registered_at) receivedRegistered++;
      const hasMet = Boolean(l.registered_at) || MET_STATUSES.includes(status as LeadStatus);
      if (hasMet) met++;
      if (hasMet || lastContact.has(l.id) || (status && status !== "potential")) contacted++;
      const source = (l.platform_source ?? "").trim() || "Not recorded";
      const s = sources.get(source) ?? { leads: 0, registered: 0 };
      s.leads++;
      if (l.registered_at) s.registered++;
      sources.set(source, s);
    }
  }

  followUps.sort((a, b) => b.daysSince - a.daysSince || a.name.localeCompare(b.name));

  return {
    registeredThisMonth,
    registeredLastMonth,
    newLeadsThisMonth,
    openLeads,
    parkedLeads,
    pipeline: [...OPEN_STATUSES, ...PARKED_STATUSES]
      .map((s) => ({ status: s, label: label(s), count: pipelineCounts.get(s) ?? 0 }))
      .filter((p) => p.count > 0),
    monthly,
    conversion: { received, registered: receivedRegistered, rate: percentOf(receivedRegistered, received) },
    funnel: [
      { label: "Leads received", value: received },
      { label: "Contacted", value: contacted },
      { label: "Meeting held", value: met },
      { label: "Registered", value: receivedRegistered },
    ],
    sources: topSources(sources, 6),
    followUpsDue: followUps.length,
    followUps: followUps.slice(0, 8),
  };
}

/** The biggest sources by count, the rest folded into "Other". */
function topSources(map: Map<string, { leads: number; registered: number }>, keep: number) {
  const sorted = [...map.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
  if (sorted.length <= keep) return sorted;
  const rest = sorted.slice(keep - 1).reduce((a, s) => ({ leads: a.leads + s.leads, registered: a.registered + s.registered }), { leads: 0, registered: 0 });
  return [...sorted.slice(0, keep - 1), { source: "Other", ...rest }];
}

export type CounselorRow = { id: string; name: string; registered: number; target: number | null; open: number; pct: number | null };

/** The team: registrations this month against each counsellor's target, best first. */
export function counselorLeaderboard(
  counselors: { id: string; full_name: string; monthly_target: number | null }[],
  leads: SalesLead[],
  month: string
): CounselorRow[] {
  const registered = new Map<string, number>();
  const open = new Map<string, number>();
  for (const l of leads) {
    if (!l.assigned_counselor_id) continue;
    if (l.registered_at && karachiMonth(l.registered_at) === month) registered.set(l.assigned_counselor_id, (registered.get(l.assigned_counselor_id) ?? 0) + 1);
    if (OPEN_STATUSES.includes((l.status ?? "") as LeadStatus)) open.set(l.assigned_counselor_id, (open.get(l.assigned_counselor_id) ?? 0) + 1);
  }
  return counselors
    .map((c) => {
      const n = registered.get(c.id) ?? 0;
      const target = c.monthly_target ?? null;
      return { id: c.id, name: c.full_name, registered: n, target, open: open.get(c.id) ?? 0, pct: target ? percentOf(n, target) : null };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.registered - a.registered || a.name.localeCompare(b.name));
}
