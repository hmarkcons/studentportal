import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { pct } from "@/lib/emailCampaigns/campaignData";
import { audienceHealth, audienceTrend, campaignRows, dailyActivity, engagedShare, type DayRow, type TrendWeek } from "@/lib/emailCampaigns/reportData";
import { karachiDay } from "@/lib/emailCampaigns/sendingRules";
import { campaignSort, senderHealth, sortCampaigns, type CampaignSort } from "@/lib/emailCampaigns/reportRules";
import { EmailTabs, karachiTime } from "../EmailTabs";
import { Kpi } from "../campaigns/[id]/report/ReportParts";
import { HotLeadsReport } from "@/components/email/HotLeads";

const DAYS = 30;

/** The dashboard's window: the last DAYS Karachi days, to today. */
function window30() {
  const now = Date.now();
  return { today: karachiDay(new Date(now)), sinceDay: karachiDay(new Date(now - (DAYS - 1) * 86_400_000)), since: new Date(now - DAYS * 86_400_000) };
}

const STATUS_LABEL: Record<string, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Marked as spam",
  suppressed: "On the do-not-email list",
  invalid: "Invalid address",
};

function DailyChart({ days }: { days: DayRow[] }) {
  const W = 840;
  const H = 150;
  const pad = { l: 40, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...days.map((d) => d.sent));
  const step = (W - pad.l - pad.r) / Math.max(1, days.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  return (
    <figure data-daily-chart>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Emails sent each day">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" strokeWidth={0.5} />
            <text x={pad.l - 4} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-muted">
              {Math.round(max * f).toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * step + step * 0.1;
          const w = step * 0.8;
          const bounced = d.hard_bounces + d.soft_bounces;
          return (
            <g key={d.day}>
              {d.sent > 0 && <rect x={x} y={y(d.sent)} width={w} height={y(0) - y(d.sent)} fill="var(--primary)" opacity={0.75} />}
              {bounced > 0 && <rect x={x} y={y(bounced)} width={w} height={y(0) - y(bounced)} fill="#dc2626" />}
              {(i % 5 === 0 || i === days.length - 1) && (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="currentColor" className="text-muted">
                  {new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-primary opacity-75" />
          Sent
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-red-600" />
          Bounced
        </span>
        <span>Karachi days</span>
      </figcaption>
    </figure>
  );
}

/** The audience week by week: who joined, and who left or can no longer be reached. */
function TrendTable({ weeks }: { weeks: TrendWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.newLeads + w.newContacts));
  return (
    <div className="overflow-x-auto" data-audience-trend>
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">Week of</th>
            <th className="py-1 pr-3 font-medium">New leads and contacts</th>
            <th className="py-1 pr-3 text-right font-medium">Unsubscribed</th>
            <th className="py-1 pr-3 text-right font-medium">Bounced</th>
            <th className="py-1 pr-3 text-right font-medium">Marked as spam</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {weeks.map((w) => {
            const joined = w.newLeads + w.newContacts;
            return (
              <tr key={w.week}>
                <td className="py-1 pr-3 text-muted">{new Date(`${w.week}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}</td>
                <td className="py-1 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-32 rounded-full bg-bg">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(joined / max) * 100}%` }} />
                    </div>
                    <span className="text-ink">
                      {joined.toLocaleString("en-US")}
                      {w.newContacts > 0 && <span className="text-muted"> ({w.newContacts.toLocaleString("en-US")} imported)</span>}
                    </span>
                  </div>
                </td>
                <td className="py-1 pr-3 text-right text-ink">{w.unsubscribed || "—"}</td>
                <td className="py-1 pr-3 text-right text-ink">{w.bounced || "—"}</td>
                <td className={`py-1 pr-3 text-right ${w.complained ? "text-danger" : "text-ink"}`}>{w.complained || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const COLUMNS: { key: CampaignSort; label: string; right?: boolean }[] = [
  { key: "name", label: "Campaign" },
  { key: "sent", label: "Sent", right: true },
  { key: "opened", label: "Opened", right: true },
  { key: "clicked", label: "Clicked", right: true },
  { key: "visited", label: "Visited", right: true },
  { key: "converted", label: "Converted", right: true },
  { key: "bounced", label: "Bounced", right: true },
  { key: "unsubscribed", label: "Unsubscribed", right: true },
];

export default async function EmailReportsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const param = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const includePractice = param("practice") === "1";
  const sort = campaignSort(param("sort"));
  const dir: "asc" | "desc" = param("dir") === "asc" ? "asc" : "desc";
  /** This page's address with the given changes, for the sort headers and the practice switch. */
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged: Record<string, string | null> = { practice: includePractice ? "1" : null, sort: sort === "started" ? null : sort, dir: dir === "desc" ? null : dir, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/marketing/email/reports?${qs}` : "/marketing/email/reports";
  };
  const { supabase } = await getStaffSession();
  const canReports = await hasPermission("email.reports.view");
  const header = (
    <>
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">How the sending is going, the audience over time, and every campaign side by side.</p>
      <EmailTabs active="reports" />
    </>
  );
  if (!canReports) {
    return (
      <div className="w-full">
        {header}
        <Card>
          <p className="text-sm text-muted">Only someone allowed to see email reports can see these.</p>
        </Card>
      </div>
    );
  }

  const { today, sinceDay, since } = window30();
  const [rows, health, allCampaigns, trend, share] = await Promise.all([
    dailyActivity(supabase, sinceDay, includePractice),
    audienceHealth(supabase, since),
    campaignRows(supabase, { includePractice, limit: 100 }),
    audienceTrend(supabase, 12),
    engagedShare(supabase, 90, includePractice),
  ]);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: DayRow[] = Array.from({ length: DAYS }, (_, i) => {
    const day = karachiDay(new Date(Date.parse(`${sinceDay}T12:00:00+05:00`) + i * 86_400_000));
    return byDay.get(day) ?? { day, sent: 0, delivered: 0, hard_bounces: 0, soft_bounces: 0, complaints: 0, opened: 0, clicked: 0, unsubscribes: 0 };
  }).filter((d) => d.day <= today);
  const sum = (k: keyof Omit<DayRow, "day">) => days.reduce((s, d) => s + d[k], 0);
  const sent = sum("sent");
  const bounced = sum("hard_bounces") + sum("soft_bounces");
  const complaints = sum("complaints");
  const health30 = senderHealth({ sent, bounced, complaints });
  const campaigns = sortCampaigns(allCampaigns, sort, dir);
  const totalAudience = health.reduce((s, h) => s + h.total, 0);

  return (
    <div className="w-full">
      {header}
      <div className="mb-3 flex items-center justify-end gap-4 text-xs">
        <Link prefetch={false} href="/marketing/email/reports/activity" className="text-primary hover:underline" data-activity-link>
          Who did what
        </Link>
        <Link prefetch={false} href={href({ practice: includePractice ? null : "1" })} className="text-primary hover:underline" data-practice-toggle>
          {includePractice ? "Show real sends only" : "Include practice sends"}
        </Link>
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">Sender health — the last {DAYS} days</h3>
          <span data-sender-health>
            <Badge tone={health30.tone}>{health30.label}</Badge>
          </span>
          {includePractice && <Badge tone="warning">Includes practice sends</Badge>}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-sender-kpis>
          <Kpi label="Sent" value={sent.toLocaleString("en-US")} />
          <Kpi label="Bounced" value={pct(bounced, sent)} sub="keep under 2%; campaigns stop themselves above 5%" tone={health30.bounceBad ? "warn" : undefined} />
          <Kpi label="Marked as spam" value={pct(complaints, sent)} sub="keep under 0.1%; Gmail's limit is 0.3%" tone={health30.complaintBad ? "warn" : undefined} />
          <Kpi label="Unsubscribed" value={sum("unsubscribes").toLocaleString("en-US")} />
        </div>
        {sent === 0 ? (
          <p className="text-xs text-muted">
            Nothing {includePractice ? "" : "real "}has been sent in the last {DAYS} days.
            {!includePractice && " Until the sending service is connected, campaigns go as practice — include them to see those."}
          </p>
        ) : (
          <DailyChart days={days} />
        )}
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">The audience’s email state</h3>
          <Link prefetch={false} href="/marketing/email/audience" className="text-xs text-primary hover:underline">
            Audience →
          </Link>
        </div>
        <p className="mb-3 text-[11px] text-muted">Of the {totalAudience.toLocaleString("en-US")} addresses with a recorded state. A lead who has never been emailed has none yet, and counts as subscribed.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-audience-health>
          {Object.keys(STATUS_LABEL).map((k) => {
            const h = health.find((x) => x.status === k);
            return <Kpi key={k} label={STATUS_LABEL[k]} value={(h?.total ?? 0).toLocaleString("en-US")} sub={h?.changed_since ? `${h.changed_since.toLocaleString("en-US")} in the last ${DAYS} days` : `none in the last ${DAYS} days`} />;
          })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div data-engaged-share>
            <Kpi
              label="Engaged in the last 90 days"
              value={pct(share.engaged, share.reached)}
              sub={
                share.reached
                  ? `${share.engaged.toLocaleString("en-US")} of the ${share.reached.toLocaleString("en-US")} people sent a ${includePractice ? "" : "real "}campaign opened or clicked`
                  : `nobody has been sent a ${includePractice ? "" : "real "}campaign in 90 days`
              }
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink">The last 12 weeks</p>
            <TrendTable weeks={trend} />
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <HotLeadsReport />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">Campaigns side by side</h3>
          {campaigns.length > 0 && (
            <div className="flex gap-3 text-xs">
              <a href={`/marketing/email/reports/export?format=csv${includePractice ? "&practice=1" : ""}&sort=${sort}&dir=${dir}`} className="text-primary hover:underline" data-dashboard-csv>
                Export CSV
              </a>
              <a href={`/marketing/email/reports/export?format=xlsx${includePractice ? "&practice=1" : ""}&sort=${sort}&dir=${dir}`} className="text-primary hover:underline" data-dashboard-xlsx>
                Export Excel
              </a>
            </div>
          )}
        </div>
        {!campaigns.length ? (
          <p className="text-xs text-muted">No {includePractice ? "" : "real "}campaign has been sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-campaign-league>
              <thead className="text-muted">
                <tr>
                  {COLUMNS.map((col) => {
                    const active = col.key === sort;
                    // A new column sorts highest first (names A to Z); the active one flips.
                    const next = active ? (dir === "desc" ? "asc" : "desc") : col.key === "name" ? "asc" : "desc";
                    return (
                      <th key={col.key} className={`py-1 pr-3 font-medium ${col.right ? "text-right" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                        <Link prefetch={false} href={href({ sort: col.key, dir: next === "desc" ? null : next })} className={`hover:text-ink ${active ? "text-ink" : ""}`} data-sort={col.key}>
                          {col.label}
                          {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => {
                  const base = c.delivered || c.sent;
                  return (
                    <tr key={c.id}>
                      <td className="py-1.5 pr-3">
                        <Link prefetch={false} href={`/marketing/email/campaigns/${c.id}/report`} className="font-medium text-ink hover:text-primary">
                          {c.name}
                        </Link>{" "}
                        {c.practice && <Badge tone="warning">Practice</Badge>}
                        <p className="text-muted">{karachiTime(c.started_at)}</p>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink">{c.sent.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(c.opened, base)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(c.clicked, base)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{c.visited.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{c.converted.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(c.bounced, c.sent)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{c.unsubscribed.toLocaleString("en-US")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
