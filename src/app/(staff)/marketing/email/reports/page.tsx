import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { campaignStats, pct } from "@/lib/emailCampaigns/campaignData";
import { audienceHealth, dailyActivity, type DayRow } from "@/lib/emailCampaigns/reportData";
import { karachiDay } from "@/lib/emailCampaigns/sendingRules";
import { senderHealth } from "@/lib/emailCampaigns/reportRules";
import { EmailTabs, karachiTime } from "../EmailTabs";
import { Kpi } from "../campaigns/[id]/report/ReportParts";

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

export default async function EmailReportsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const includePractice = sp.practice === "1";
  const { supabase } = await getStaffSession();
  const canReports = await hasPermission("email.reports.view");
  const header = (
    <>
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">How the sending is going, the state of the audience, and every campaign side by side.</p>
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
  const [rows, health, { data: recent }] = await Promise.all([
    dailyActivity(supabase, sinceDay, includePractice),
    audienceHealth(supabase, since),
    (() => {
      let q = supabase.from("email_campaigns").select("id, name, status, practice, started_at, recipients_total").not("started_at", "is", null);
      if (!includePractice) q = q.eq("practice", false);
      return q.order("started_at", { ascending: false }).limit(25);
    })(),
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
  const campaigns = recent ?? [];
  const stats = await campaignStats(supabase, campaigns.map((c) => c.id as string));
  const totalAudience = health.reduce((s, h) => s + h.total, 0);

  return (
    <div className="w-full">
      {header}
      <div className="mb-3 flex items-center justify-end gap-2 text-xs">
        <Link prefetch={false} href={includePractice ? "/marketing/email/reports" : "/marketing/email/reports?practice=1"} className="text-primary hover:underline" data-practice-toggle>
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
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Campaigns side by side</h3>
        {!campaigns.length ? (
          <p className="text-xs text-muted">No {includePractice ? "" : "real "}campaign has been sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-campaign-league>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Campaign</th>
                  <th className="py-1 pr-3 text-right font-medium">Sent</th>
                  <th className="py-1 pr-3 text-right font-medium">Opened</th>
                  <th className="py-1 pr-3 text-right font-medium">Clicked</th>
                  <th className="py-1 pr-3 text-right font-medium">Visited</th>
                  <th className="py-1 pr-3 text-right font-medium">Converted</th>
                  <th className="py-1 pr-3 text-right font-medium">Bounced</th>
                  <th className="py-1 pr-3 text-right font-medium">Unsubscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => {
                  const s = stats.get(c.id as string)!;
                  const base = s.delivered || s.sent;
                  return (
                    <tr key={c.id as string}>
                      <td className="py-1.5 pr-3">
                        <Link prefetch={false} href={`/marketing/email/campaigns/${c.id}/report`} className="font-medium text-ink hover:text-primary">
                          {c.name as string}
                        </Link>{" "}
                        {c.practice && <Badge tone="warning">Practice</Badge>}
                        <p className="text-muted">{karachiTime(c.started_at as string)}</p>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ink">{s.sent.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(s.opened_human, base)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(s.clicked_human, base)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{s.visited.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{s.converted.toLocaleString("en-US")}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{pct(s.hard_bounces + s.soft_bounces, s.sent)}</td>
                      <td className="py-1.5 pr-3 text-right text-ink">{s.unsubscribes.toLocaleString("en-US")}</td>
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
