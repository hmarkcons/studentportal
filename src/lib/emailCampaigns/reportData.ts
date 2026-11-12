import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignStats, type CampaignStats } from "./campaignData";
import { applyFilter, compareWithEarlier, type CampaignRow, type DayPoint, type HourPoint, type Rates, type RecipientFilter } from "./reportRules";

// A campaign report's reads (0359). Each is read as the caller, so someone
// without email.reports.view gets empty answers, never another's numbers.

const num = (v: unknown) => Number(v ?? 0);

export async function campaignTimeline(supabase: SupabaseClient, campaignId: string, from: Date, hours: number): Promise<HourPoint[]> {
  const { data } = await supabase.rpc("email_campaign_timeline", { p_campaign_id: campaignId, p_from: from.toISOString(), p_hours: hours });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ bucket: String(r.bucket), opens: num(r.opens), clicks: num(r.clicks), visits: num(r.visits) }));
}

export type LinkRow = { link_id: string; pos: number; url: string; label: string; clicks: number; human_clicks: number; people: number };

export async function linkReport(supabase: SupabaseClient, campaignId: string): Promise<LinkRow[]> {
  const { data } = await supabase.rpc("email_campaign_link_report", { p_campaign_id: campaignId });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    link_id: String(r.link_id),
    pos: num(r.pos),
    url: String(r.url ?? ""),
    label: String(r.label ?? ""),
    clicks: num(r.clicks),
    human_clicks: num(r.human_clicks),
    people: num(r.people),
  }));
}

export type Dimension = "domain" | "device" | "client" | "country" | "city" | "bounce_reason" | "bounce_domain";
export type BreakdownRow = { key: string; recipients: number; delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number };

export async function breakdown(supabase: SupabaseClient, campaignId: string, dimension: Dimension): Promise<BreakdownRow[]> {
  const { data } = await supabase.rpc("email_campaign_breakdown", { p_campaign_id: campaignId, p_dimension: dimension });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    key: String(r.key),
    recipients: num(r.recipients),
    delivered: num(r.delivered),
    opened: num(r.opened),
    clicked: num(r.clicked),
    bounced: num(r.bounced),
    unsubscribed: num(r.unsubscribed),
  }));
}

export type WebRow = { kind: "page" | "conversion"; key: string; events: number; people: number };

export async function webReport(supabase: SupabaseClient, campaignId: string): Promise<WebRow[]> {
  const { data } = await supabase.rpc("email_campaign_web_report", { p_campaign_id: campaignId });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ kind: r.kind === "conversion" ? "conversion" : "page", key: String(r.key), events: num(r.events), people: num(r.people) }));
}

export type DayRow = { day: string; sent: number; delivered: number; hard_bounces: number; soft_bounces: number; complaints: number; opened: number; clicked: number; unsubscribes: number };

export async function dailyActivity(supabase: SupabaseClient, since: string, includePractice: boolean): Promise<DayRow[]> {
  const { data } = await supabase.rpc("email_daily_activity", { p_since: since, p_include_practice: includePractice });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    day: String(r.day),
    sent: num(r.sent),
    delivered: num(r.delivered),
    hard_bounces: num(r.hard_bounces),
    soft_bounces: num(r.soft_bounces),
    complaints: num(r.complaints),
    opened: num(r.opened),
    clicked: num(r.clicked),
    unsubscribes: num(r.unsubscribes),
  }));
}

export async function audienceHealth(supabase: SupabaseClient, since: Date): Promise<{ status: string; total: number; changed_since: number }[]> {
  const { data } = await supabase.rpc("email_audience_health", { p_since: since.toISOString() });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ status: String(r.status), total: num(r.total), changed_since: num(r.changed_since) }));
}

export const RECIPIENT_COLUMNS =
  "id, email, lead_id, contact_id, merge_values, status, sent_at, delivered_at, first_open_at, open_count, human_open_count, first_click_at, click_count, human_click_count, bounce, bounce_reason, complained_at, unsubscribed_at, visited_at, converted_at, last_activity_at, device, client, country, city, last_error";

export type RecipientRow = {
  id: string;
  email: string;
  lead_id: string | null;
  contact_id: string | null;
  merge_values: Record<string, string | null> | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  first_open_at: string | null;
  open_count: number;
  human_open_count: number;
  first_click_at: string | null;
  click_count: number;
  human_click_count: number;
  bounce: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  visited_at: string | null;
  converted_at: string | null;
  last_activity_at: string | null;
  device: string | null;
  client: string | null;
  country: string | null;
  city: string | null;
  last_error: string | null;
};

/** A page of a campaign's recipients under a filter, with the filter's total. */
export async function recipientPage(
  supabase: SupabaseClient,
  campaignId: string,
  { filter, search, page, size = 50 }: { filter: RecipientFilter; search: string; page: number; size?: number }
): Promise<{ rows: RecipientRow[]; total: number }> {
  let q = supabase.from("email_campaign_recipients").select(RECIPIENT_COLUMNS, { count: "exact" }).eq("campaign_id", campaignId);
  q = applyFilter(q, filter);
  const s = search.trim().toLowerCase().replace(/[%_,()]/g, "");
  if (s) q = q.ilike("email", `%${s}%`);
  const { data, count } = await q
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("email")
    .range(page * size, page * size + size - 1);
  return { rows: (data ?? []) as unknown as RecipientRow[], total: count ?? 0 };
}

/** Every recipient under a filter, a thousand at a time, for the export and for making a list. */
export async function allRecipients(supabase: SupabaseClient, campaignId: string, filter: RecipientFilter, cap = 100_000): Promise<RecipientRow[]> {
  const out: RecipientRow[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await applyFilter(supabase.from("email_campaign_recipients").select(RECIPIENT_COLUMNS).eq("campaign_id", campaignId), filter)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as RecipientRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type EventRow = { id: number; type: string; occurred_at: string; url: string | null; device: string | null; client: string | null; ip_country: string | null; ip_city: string | null; is_machine: boolean; simulated: boolean; diagnostic: string | null };

export async function recipientEvents(supabase: SupabaseClient, recipientId: string): Promise<EventRow[]> {
  const { data } = await supabase
    .from("email_events")
    .select("id, type, occurred_at, url, device, client, ip_country, ip_city, is_machine, simulated, diagnostic")
    .eq("recipient_id", recipientId)
    .order("occurred_at")
    .limit(500);
  return (data ?? []) as EventRow[];
}

export const ratesOfStats = (s: CampaignStats): Rates => ({
  sent: s.sent,
  delivered: s.delivered,
  opened: s.opened_human,
  clicked: s.clicked_human,
  bounced: s.hard_bounces + s.soft_bounces,
  unsubscribed: s.unsubscribes,
  complained: s.complaints,
});

/** This campaign against the ten finished before it — practice against practice, real against real. */
export async function earlierComparison(
  supabase: SupabaseClient,
  c: { id: string; practice: boolean; started_at: string },
  current: CampaignStats
): Promise<{ comparison: ReturnType<typeof compareWithEarlier>; count: number }> {
  const { data } = await supabase
    .from("email_campaigns")
    .select("id")
    .eq("status", "sent")
    .eq("practice", c.practice)
    .neq("id", c.id)
    .lt("started_at", c.started_at)
    .order("started_at", { ascending: false })
    .limit(10);
  const earlier = await campaignStats(supabase, (data ?? []).map((r) => r.id as string));
  return { comparison: compareWithEarlier(ratesOfStats(current), [...earlier.values()].map(ratesOfStats)), count: earlier.size };
}

/** The rows the overview and the PDF compare, and whether higher is better. */
export const COMPARED_RATES = [
  ["Opened", "open", true],
  ["Clicked", "click", true],
  ["Clicked, of those who opened", "clickToOpen", true],
  ["Bounced", "bounce", false],
  ["Unsubscribed", "unsubscribe", false],
  ["Marked as spam", "complaint", false],
] as const;

export async function campaignDaily(supabase: SupabaseClient, campaignId: string, from: Date, days: number): Promise<DayPoint[]> {
  const { data } = await supabase.rpc("email_campaign_daily", { p_campaign_id: campaignId, p_from: from.toISOString(), p_days: days });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ day: String(r.day), opens: num(r.opens), clicks: num(r.clicks), visits: num(r.visits) }));
}

export type WebSessions = { visits: number; pageViews: number; multiPageVisits: number; avgSeconds: number | null };

export async function webSessions(supabase: SupabaseClient, campaignId: string): Promise<WebSessions> {
  const { data } = await supabase.rpc("email_campaign_web_sessions", { p_campaign_id: campaignId });
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return { visits: num(r.visits), pageViews: num(r.page_views), multiPageVisits: num(r.multi_page_visits), avgSeconds: r.avg_seconds == null ? null : Number(r.avg_seconds) };
}

export type TrendWeek = { week: string; newLeads: number; newContacts: number; unsubscribed: number; bounced: number; complained: number };

export async function audienceTrend(supabase: SupabaseClient, weeks: number): Promise<TrendWeek[]> {
  const { data } = await supabase.rpc("email_audience_trend", { p_weeks: weeks });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    week: String(r.week_start),
    newLeads: num(r.new_leads),
    newContacts: num(r.new_contacts),
    unsubscribed: num(r.unsubscribed),
    bounced: num(r.bounced),
    complained: num(r.complained),
  }));
}

export async function engagedShare(supabase: SupabaseClient, days: number, includePractice: boolean): Promise<{ reached: number; engaged: number }> {
  const { data } = await supabase.rpc("email_engaged_share", { p_days: days, p_include_practice: includePractice });
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return { reached: num(r.reached), engaged: num(r.engaged) };
}

/** Started campaigns (real only, unless practice is asked for) as the dashboard's rows. */
export async function campaignRows(supabase: SupabaseClient, { includePractice, limit }: { includePractice: boolean; limit: number }): Promise<CampaignRow[]> {
  let q = supabase.from("email_campaigns").select("id, name, practice, started_at").not("started_at", "is", null);
  if (!includePractice) q = q.eq("practice", false);
  const { data } = await q.order("started_at", { ascending: false }).limit(limit);
  const list = data ?? [];
  const stats = await campaignStats(supabase, list.map((c) => c.id as string));
  return list.map((c) => {
    const s = stats.get(c.id as string)!;
    return {
      id: c.id as string,
      name: c.name as string,
      practice: Boolean(c.practice),
      started_at: c.started_at as string,
      sent: s.sent,
      delivered: s.delivered,
      opened: s.opened_human,
      clicked: s.clicked_human,
      visited: s.visited,
      converted: s.converted,
      bounced: s.hard_bounces + s.soft_bounces,
      unsubscribed: s.unsubscribes,
      complaints: s.complaints,
    };
  });
}
