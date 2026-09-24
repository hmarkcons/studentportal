// The marketing dashboards: the social media designer's (Digital Marketing)
// — the social calendar and the ads — and lead generation's (Marketing) —
// where leads come from and what becomes of them. Pure —
// scripts/dashboards-test.mjs.

import { isMissedPost, socialPostStatusLabel, SOCIAL_POST_STATUSES } from "../marketing.ts";
import type { ReportMonth } from "../leadOwners.ts";
import { percentOf } from "../chartMath.ts";
import { addDays, karachiMonth } from "./dates.ts";
import type { SalesLead } from "./sales.ts";

/** How far ahead the designer's "coming up" list looks. */
export const UPCOMING_DAYS = 7;
/** On-time rate is measured over posts dated in the last this-many days. */
export const ON_TIME_DAYS = 30;

/** A slot on the social calendar. It has no title; its theme is what it is about. */
export type Post = { id: string; theme: string | null; post_date: string; status: string; platforms: string[] | null };
/** An ad campaign has no name of its own; it is known by where it runs and for whom. */
export type AdCampaign = {
  id: string;
  platform: string | null;
  country: string | null;
  planned_spend: number | string | null;
  actual_spend: number | string | null;
  start_date: string | null;
  end_date: string | null;
};
export type Campaign = {
  id: string;
  name: string | null;
  type: string | null;
  event_date_start: string | null;
  actual_spend: number | string | null;
  budget: number | string | null;
};
export type Referral = { incentive_status: string | null; incentive_owed: number | string | null; currency: string | null };

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type SocialSummary = {
  /** All of them — the lists below are the first few. */
  upcomingCount: number;
  missedCount: number;
  upcoming: { id: string; title: string; date: string; status: string; statusLabel: string }[];
  missed: { id: string; title: string; date: string; statusLabel: string }[];
  /** Posts still to go out, by where they are in production. */
  pipeline: { status: string; label: string; count: number }[];
  postedMonthly: { key: string; label: string; count: number }[];
  onTime: { due: number; posted: number; rate: number | null };
  platforms: { label: string; count: number }[];
  ads: { id: string; name: string; platform: string; planned: number; actual: number; active: boolean }[];
  adSpendActive: { planned: number; actual: number };
};

export function summarizeSocial({ posts, ads, months, today }: { posts: Post[]; ads: AdCampaign[]; months: ReportMonth[]; today: string }): SocialSummary {
  const horizon = addDays(today, UPCOMING_DAYS);
  const since = addDays(today, -ON_TIME_DAYS);
  const postedMonthly = months.map((m) => ({ key: m.key, label: m.label, count: 0 }));
  const bucket = new Map(postedMonthly.map((m) => [m.key, m]));
  const pipeline = new Map<string, number>();
  const platforms = new Map<string, number>();
  const upcoming: SocialSummary["upcoming"] = [];
  const missed: SocialSummary["missed"] = [];
  let due = 0;
  let posted = 0;

  for (const p of posts) {
    const date = p.post_date.slice(0, 10);
    const title = p.theme?.trim() || "Post with no theme";
    if (p.status === "posted") {
      const b = bucket.get(karachiMonth(date));
      if (b) b.count++;
    } else if (date >= today) {
      pipeline.set(p.status, (pipeline.get(p.status) ?? 0) + 1);
    }
    if (date >= today && date <= horizon) upcoming.push({ id: p.id, title, date, status: p.status, statusLabel: socialPostStatusLabel(p.status) });
    if (isMissedPost(date, p.status, today)) missed.push({ id: p.id, title, date, statusLabel: socialPostStatusLabel(p.status) });
    if (date >= since && date < today) {
      due++;
      if (p.status === "posted") posted++;
    }
    if (date >= addDays(today, -90)) for (const pl of p.platforms ?? []) platforms.set(pl, (platforms.get(pl) ?? 0) + 1);
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  missed.sort((a, b) => b.date.localeCompare(a.date));

  const adRows = ads.map((a) => {
    const active = (!a.start_date || a.start_date.slice(0, 10) <= today) && (!a.end_date || a.end_date.slice(0, 10) >= today);
    const name = [a.platform, a.country].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ") || "Ad campaign";
    return { id: a.id, name, platform: a.platform ?? "", planned: num(a.planned_spend), actual: num(a.actual_spend), active };
  });
  const activeAds = adRows.filter((a) => a.active);

  return {
    upcomingCount: upcoming.length,
    missedCount: missed.length,
    upcoming: upcoming.slice(0, 8),
    missed: missed.slice(0, 6),
    pipeline: SOCIAL_POST_STATUSES.filter((s) => s !== "posted").map((s) => ({ status: s, label: socialPostStatusLabel(s), count: pipeline.get(s) ?? 0 })),
    postedMonthly,
    onTime: { due, posted, rate: percentOf(posted, due) },
    platforms: [...platforms.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    ads: activeAds.sort((a, b) => b.actual - a.actual).slice(0, 6),
    adSpendActive: { planned: activeAds.reduce((s, a) => s + a.planned, 0), actual: activeAds.reduce((s, a) => s + a.actual, 0) },
  };
}

export type LeadGenSummary = {
  monthly: { key: string; label: string; leads: number; registered: number }[];
  leadsThisMonth: number;
  leadsLastMonth: number;
  unassigned: number;
  /** Every campaign with its leads, registrations and what each cost. */
  campaigns: { id: string; name: string; leads: number; registered: number; spend: number; costPerLead: number | null; costPerRegistration: number | null }[];
  upcomingEventCount: number;
  upcomingEvents: { id: string; name: string; date: string }[];
  referralsOwed: { count: number; amount: number };
};

/**
 * Lead generation: leads by the month they arrived, and — for each month —
 * how many of that month's leads have since registered, so a month's quality
 * shows as well as its volume.
 */
export function summarizeLeadGen({
  leads,
  campaigns,
  leadCampaign,
  referrals,
  months,
  today,
}: {
  leads: SalesLead[];
  campaigns: Campaign[];
  /** lead id → campaign id, for leads that came from one. */
  leadCampaign: Map<string, string>;
  referrals: Referral[];
  months: ReportMonth[];
  today: string;
}): LeadGenSummary {
  const monthly = months.map((m) => ({ key: m.key, label: m.label, leads: 0, registered: 0 }));
  const bucket = new Map(monthly.map((m) => [m.key, m]));
  const thisMonth = today.slice(0, 7);
  const lastMonth = months.length >= 2 ? months[months.length - 2].key : "";
  const perCampaign = new Map<string, { leads: number; registered: number }>();
  let unassigned = 0;
  let leadsThisMonth = 0;
  let leadsLastMonth = 0;

  for (const l of leads) {
    const month = karachiMonth(l.created_at);
    const b = bucket.get(month);
    if (b) {
      b.leads++;
      if (l.registered_at) b.registered++;
    }
    if (month === thisMonth) leadsThisMonth++;
    if (month === lastMonth) leadsLastMonth++;
    if (!l.assigned_counselor_id && !l.registered_at && l.status !== "not_interested" && l.status !== "not_eligible") unassigned++;
    const c = leadCampaign.get(l.id);
    if (c) {
      const row = perCampaign.get(c) ?? { leads: 0, registered: 0 };
      row.leads++;
      if (l.registered_at) row.registered++;
      perCampaign.set(c, row);
    }
  }

  const campaignRows = campaigns
    .map((c) => {
      const counts = perCampaign.get(c.id) ?? { leads: 0, registered: 0 };
      const spend = num(c.actual_spend);
      return {
        id: c.id,
        name: c.name?.trim() || "Campaign",
        ...counts,
        spend,
        costPerLead: spend > 0 && counts.leads > 0 ? Math.round(spend / counts.leads) : null,
        costPerRegistration: spend > 0 && counts.registered > 0 ? Math.round(spend / counts.registered) : null,
      };
    })
    .filter((c) => c.leads > 0 || c.spend > 0)
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));

  const upcomingEvents = campaigns
    .filter((c) => c.type === "event" && c.event_date_start && c.event_date_start.slice(0, 10) >= today)
    .map((c) => ({ id: c.id, name: c.name?.trim() || "Event", date: (c.event_date_start ?? "").slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const owed = referrals.filter((r) => r.incentive_status === "owed");

  return {
    monthly,
    leadsThisMonth,
    leadsLastMonth,
    unassigned,
    campaigns: campaignRows.slice(0, 8),
    upcomingEventCount: upcomingEvents.length,
    upcomingEvents: upcomingEvents.slice(0, 5),
    referralsOwed: { count: owed.length, amount: owed.reduce((a, r) => a + num(r.incentive_owed), 0) },
  };
}

