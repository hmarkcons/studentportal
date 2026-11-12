// What a campaign's report is made of, apart from the database: the recipient
// filters (one definition for the table, the export and "make a list of
// these"), the export's CSV, the hour-by-hour timeline with its quiet hours
// filled in, and how a campaign compares with the ones before it.
//
// No portal imports, so the unit tests load it under plain Node.

export const RECIPIENT_FILTERS = [
  { key: "all", label: "Everyone sent to" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "not_opened", label: "Did not open" },
  { key: "clicked", label: "Clicked" },
  { key: "opened_not_clicked", label: "Opened, did not click" },
  { key: "visited", label: "Visited the website" },
  { key: "converted", label: "Converted" },
  { key: "bounced", label: "Bounced" },
  { key: "unsubscribed", label: "Unsubscribed" },
  { key: "complained", label: "Marked as spam" },
  { key: "failed", label: "Could not be sent" },
] as const;

export type RecipientFilter = (typeof RECIPIENT_FILTERS)[number]["key"];

export function recipientFilter(raw: string | null | undefined): RecipientFilter {
  return (RECIPIENT_FILTERS.find((f) => f.key === raw)?.key ?? "all") as RecipientFilter;
}

export function filterLabel(key: RecipientFilter): string {
  return RECIPIENT_FILTERS.find((f) => f.key === key)?.label ?? "Everyone sent to";
}

/** One condition on email_campaign_recipients, applied by the caller to its query. */
export type Condition =
  | { op: "eq"; col: string; value: string | number }
  | { op: "gt"; col: string; value: number }
  | { op: "is_null"; col: string }
  | { op: "not_null"; col: string };

/** The conditions a filter puts on a campaign's recipients. "People" only: machine opens and scanner clicks are not opens or clicks. */
export function filterConditions(key: RecipientFilter): Condition[] {
  switch (key) {
    case "all":
      return [{ op: "eq", col: "status", value: "sent" }];
    case "delivered":
      return [{ op: "not_null", col: "delivered_at" }];
    case "opened":
      return [{ op: "gt", col: "human_open_count", value: 0 }];
    case "not_opened":
      return [
        { op: "eq", col: "status", value: "sent" },
        { op: "eq", col: "human_open_count", value: 0 },
        { op: "is_null", col: "bounce" },
      ];
    case "clicked":
      return [{ op: "gt", col: "human_click_count", value: 0 }];
    case "opened_not_clicked":
      return [
        { op: "gt", col: "human_open_count", value: 0 },
        { op: "eq", col: "human_click_count", value: 0 },
      ];
    case "visited":
      return [{ op: "not_null", col: "visited_at" }];
    case "converted":
      return [{ op: "not_null", col: "converted_at" }];
    case "bounced":
      return [{ op: "not_null", col: "bounce" }];
    case "unsubscribed":
      return [{ op: "not_null", col: "unsubscribed_at" }];
    case "complained":
      return [{ op: "not_null", col: "complained_at" }];
    case "failed":
      return [{ op: "eq", col: "status", value: "failed" }];
  }
}

type FilterLike = {
  eq(col: string, value: unknown): FilterLike;
  gt(col: string, value: unknown): FilterLike;
  is(col: string, value: null): FilterLike;
  not(col: string, op: string, value: null): FilterLike;
};

/** Applies a filter's conditions to a Supabase query on email_campaign_recipients. */
export function applyFilter<Q>(query: Q, key: RecipientFilter): Q {
  let q = query as unknown as FilterLike;
  for (const c of filterConditions(key)) {
    if (c.op === "eq") q = q.eq(c.col, c.value);
    else if (c.op === "gt") q = q.gt(c.col, c.value);
    else if (c.op === "is_null") q = q.is(c.col, null);
    else q = q.not(c.col, "is", null);
  }
  return q as unknown as Q;
}

/** What a recipient did, in a word or two, most telling first. */
export function recipientOutcome(r: {
  status: string;
  bounce: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  converted_at: string | null;
  visited_at: string | null;
  human_click_count: number;
  human_open_count: number;
  delivered_at: string | null;
}): string {
  if (r.status === "failed") return "Could not be sent";
  if (r.status !== "sent") return "Waiting";
  if (r.bounce === "hard") return "Bounced";
  if (r.bounce === "soft") return "Bounced (temporary)";
  if (r.complained_at) return "Marked as spam";
  if (r.unsubscribed_at) return "Unsubscribed";
  if (r.converted_at) return "Converted";
  if (r.visited_at) return "Visited the website";
  if (r.human_click_count > 0) return "Clicked";
  if (r.human_open_count > 0) return "Opened";
  if (r.delivered_at) return "Delivered";
  return "Sent";
}

/**
 * One CSV cell. A cell Excel would read as a formula (=, +, -, @, tab, CR)
 * is prefixed with an apostrophe, so a name like "=HYPERLINK(…)" stays text.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows as CSV, with a byte-order mark so Excel reads it as UTF-8. */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type HourPoint = { bucket: string; opens: number; clicks: number; visits: number };

/** Every hour from `from` for `hours`, with the hours nothing happened in as zeros. */
export function fillHours(points: HourPoint[], from: Date, hours: number): HourPoint[] {
  const start = Math.floor(from.getTime() / 3_600_000) * 3_600_000;
  const byHour = new Map(points.map((p) => [Math.floor(Date.parse(p.bucket) / 3_600_000) * 3_600_000, p]));
  return Array.from({ length: Math.max(0, hours) }, (_, i) => {
    const t = start + i * 3_600_000;
    const p = byHour.get(t);
    return { bucket: new Date(t).toISOString(), opens: p?.opens ?? 0, clicks: p?.clicks ?? 0, visits: p?.visits ?? 0 };
  });
}

/** How many hours the hourly chart shows: from the start until now, at least a day and at most 72 hours (day by day after that). */
export function timelineHours(startedAt: Date, now: Date = new Date()): number {
  const elapsed = Math.ceil((now.getTime() - startedAt.getTime()) / 3_600_000) + 1;
  return Math.min(72, Math.max(24, elapsed));
}

export type Rates = { sent: number; delivered: number; opened: number; clicked: number; bounced: number; unsubscribed: number; complained: number };

/** A campaign's rates, as fractions: opens and clicks of those delivered (of those sent until deliveries are reported). */
export function ratesOf(s: Rates) {
  const base = s.delivered || s.sent;
  const share = (n: number, d: number) => (d > 0 ? n / d : null);
  return {
    open: share(s.opened, base),
    click: share(s.clicked, base),
    clickToOpen: share(s.clicked, s.opened),
    bounce: share(s.bounced, s.sent),
    unsubscribe: share(s.unsubscribed, base),
    complaint: share(s.complained, base),
  };
}

export type RateKey = keyof ReturnType<typeof ratesOf>;

/** The average of earlier campaigns' rates (each campaign counts once, whatever its size), and this one's difference in points. */
export function compareWithEarlier(current: Rates, earlier: Rates[]): Record<RateKey, { value: number | null; average: number | null; points: number | null }> {
  const now = ratesOf(current);
  const past = earlier.filter((e) => e.sent > 0).map(ratesOf);
  const out = {} as Record<RateKey, { value: number | null; average: number | null; points: number | null }>;
  for (const k of Object.keys(now) as RateKey[]) {
    const vals = past.map((p) => p[k]).filter((v): v is number => v !== null);
    const average = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const value = now[k];
    out[k] = { value, average, points: value !== null && average !== null ? Math.round((value - average) * 1000) / 10 : null };
  }
  return out;
}

/** A time as the office reads it, for a file: "2026-11-11 15:04" in Karachi. */
export function karachiStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + 5 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

export const RECIPIENT_EXPORT_HEADER = [
  "Email",
  "Name",
  "What they did",
  "Sent",
  "Delivered",
  "First opened",
  "Opens (person)",
  "Opens (machines)",
  "First clicked",
  "Clicks (person)",
  "Clicks (machines)",
  "Visited the website",
  "Converted",
  "Unsubscribed",
  "Marked as spam",
  "Bounce",
  "Bounce reason",
  "Mail app",
  "Device",
  "City",
  "Country",
  "Lead",
];

export type ExportRecipient = Parameters<typeof recipientOutcome>[0] & {
  email: string;
  merge_values: Record<string, string | null> | null;
  sent_at: string | null;
  first_open_at: string | null;
  open_count: number;
  first_click_at: string | null;
  click_count: number;
  bounce_reason: string | null;
  client: string | null;
  device: string | null;
  city: string | null;
  country: string | null;
  lead_id: string | null;
};

/** One recipient as a row of the export, in RECIPIENT_EXPORT_HEADER's order. `leadUrl` makes the lead a link. */
export function recipientExportRow(r: ExportRecipient, leadUrl: (id: string) => string): string[] {
  const m = r.merge_values ?? {};
  return [
    r.email,
    m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "",
    recipientOutcome(r),
    karachiStamp(r.sent_at),
    karachiStamp(r.delivered_at),
    karachiStamp(r.first_open_at),
    String(r.human_open_count),
    String(Math.max(0, r.open_count - r.human_open_count)),
    karachiStamp(r.first_click_at),
    String(r.human_click_count),
    String(Math.max(0, r.click_count - r.human_click_count)),
    karachiStamp(r.visited_at),
    karachiStamp(r.converted_at),
    karachiStamp(r.unsubscribed_at),
    karachiStamp(r.complained_at),
    r.bounce ?? "",
    r.bounce_reason ?? "",
    r.client ?? "",
    r.device ?? "",
    r.city ?? "",
    r.country ?? "",
    r.lead_id ? leadUrl(r.lead_id) : "",
  ];
}

/** "italy-scholarships-nov-opened-2026-11-11.csv" */
export function exportFileName(slug: string, filter: RecipientFilter, day: string, ext: "csv" | "xlsx"): string {
  const s = (slug || "campaign").replace(/[^a-z0-9-]+/gi, "-").slice(0, 60);
  return `${s}-${filter.replace(/_/g, "-")}-${day}.${ext}`;
}

/**
 * The sender's health in a word, from what real mail did: bounces under 2%
 * and complaints under 0.1% are healthy; over 5% or 0.3% (Gmail's own limit)
 * puts the domain's reputation at risk.
 */
export function senderHealth({ sent, bounced, complaints }: { sent: number; bounced: number; complaints: number }): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  bounceBad: boolean;
  complaintBad: boolean;
} {
  if (sent <= 0) return { label: "Nothing sent yet", tone: "neutral", bounceBad: false, complaintBad: false };
  const b = bounced / sent;
  const c = complaints / sent;
  const bounceBad = b > 0.02;
  const complaintBad = c > 0.001;
  if (b > 0.05 || c > 0.003) return { label: "At risk", tone: "danger", bounceBad, complaintBad };
  if (bounceBad || complaintBad) return { label: "Watch it", tone: "warning", bounceBad, complaintBad };
  return { label: "Healthy", tone: "success", bounceBad, complaintBad };
}

export type DayPoint = { day: string; opens: number; clicks: number; visits: number };

/** Every Karachi day from `firstDay` for `days`, quiet days as zeros. */
export function fillDays(points: DayPoint[], firstDay: string, days: number): DayPoint[] {
  const byDay = new Map(points.map((p) => [p.day.slice(0, 10), p]));
  const start = Date.parse(`${firstDay}T00:00:00Z`);
  return Array.from({ length: Math.max(0, days) }, (_, i) => {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const p = byDay.get(day);
    return { day, opens: p?.opens ?? 0, clicks: p?.clicks ?? 0, visits: p?.visits ?? 0 };
  });
}

/** Days from the start's Karachi day to today's, inclusive, at most 60. */
export function daysSince(startedAt: Date, now: Date = new Date()): number {
  const k = (d: Date) => Date.parse(new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10));
  return Math.min(60, Math.max(1, Math.round((k(now) - k(startedAt)) / 86_400_000) + 1));
}

/** One campaign as the dashboard's table shows it. */
export type CampaignRow = {
  id: string;
  name: string;
  practice: boolean;
  started_at: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  visited: number;
  converted: number;
  bounced: number;
  unsubscribed: number;
  complaints: number;
};

export const CAMPAIGN_SORTS = ["started", "name", "sent", "opened", "clicked", "visited", "converted", "bounced", "unsubscribed"] as const;
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number];

export function campaignSort(raw: string | null | undefined): CampaignSort {
  return (CAMPAIGN_SORTS as readonly string[]).includes(raw ?? "") ? (raw as CampaignSort) : "started";
}

const reachedOf = (r: CampaignRow) => r.delivered || r.sent;
const shareOf = (n: number, d: number) => (d > 0 ? n / d : -1);

/** The value a column sorts by: a rate where the table shows a rate, a count where it shows a count. */
export function sortValue(r: CampaignRow, key: CampaignSort): number | string {
  switch (key) {
    case "started":
      return r.started_at;
    case "name":
      return r.name.toLowerCase();
    case "sent":
      return r.sent;
    case "opened":
      return shareOf(r.opened, reachedOf(r));
    case "clicked":
      return shareOf(r.clicked, reachedOf(r));
    case "visited":
      return r.visited;
    case "converted":
      return r.converted;
    case "bounced":
      return shareOf(r.bounced, r.sent);
    case "unsubscribed":
      return r.unsubscribed;
  }
}

/** Rows sorted by a column; ties keep the newest first. */
export function sortCampaigns(rows: CampaignRow[], key: CampaignSort, dir: "asc" | "desc"): CampaignRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return c !== 0 ? c * sign : b.started_at.localeCompare(a.started_at);
  });
}

const pctText = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "");

export const CAMPAIGN_EXPORT_HEADER = [
  "Campaign",
  "Practice",
  "Started",
  "Sent",
  "Delivered",
  "Opened (people)",
  "Opened %",
  "Clicked (people)",
  "Clicked %",
  "Visited the website",
  "Converted",
  "Bounced",
  "Bounced %",
  "Unsubscribed",
  "Marked as spam",
];

/** The dashboard's table as rows for a file, in CAMPAIGN_EXPORT_HEADER's order. */
export function campaignExportRow(r: CampaignRow): string[] {
  const base = reachedOf(r);
  return [
    r.name,
    r.practice ? "yes" : "",
    karachiStamp(r.started_at),
    String(r.sent),
    String(r.delivered),
    String(r.opened),
    pctText(r.opened, base),
    String(r.clicked),
    pctText(r.clicked, base),
    String(r.visited),
    String(r.converted),
    String(r.bounced),
    pctText(r.bounced, r.sent),
    String(r.unsubscribed),
    String(r.complaints),
  ];
}

/** A time on site: 38s, 4m 05s, 1h 02m. */
export function durationText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}
