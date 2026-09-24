import type { SupabaseClient } from "@supabase/supabase-js";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { HBarList } from "@/components/charts/HBarList";
import { karachiToday } from "@/lib/calendarDates";
import { recentMonths } from "@/lib/leadOwners";
import { formatAmount } from "@/lib/marketing";
import { ON_TIME_DAYS, UPCOMING_DAYS, summarizeLeadGen, summarizeSocial } from "@/lib/dashboards/marketing";
import { RECENT_DAYS, summarizeSales } from "@/lib/dashboards/sales";
import { loadLeadGenRows, loadSocialRows } from "@/lib/dashboards/load";
import { Kpis, LinkList, Row, versus } from "./shared";

/**
 * The social media designer's dashboard (Digital Marketing): what is due on
 * the calendar, what is in production, what was missed, how reliably posts go
 * out on the day, and the ads running now against their budgets.
 */
export async function SocialView({ db }: { db: SupabaseClient }) {
  const today = karachiToday();
  const months = recentMonths(6);
  const { posts, ads } = await loadSocialRows(db, { today });
  const s = summarizeSocial({ posts, ads, months, today });
  const inProduction = s.pipeline.reduce((a, p) => a + p.count, 0);

  return (
    <div className="flex flex-col gap-4" data-dashboard-view="social">
      <Kpis>
        <StatCard label={`Due in ${UPCOMING_DAYS} days`} value={s.upcomingCount} hint={`${inProduction} posts in production`} />
        <StatCard label="Missed posts" value={s.missedCount} tone={s.missedCount ? "danger" : "default"} hint="date passed, not posted" />
        <StatCard label="Posted on time" value={s.onTime.rate === null ? "—" : `${s.onTime.rate}%`} tone={s.onTime.rate !== null && s.onTime.rate < 80 ? "warning" : "success"} hint={`last ${ON_TIME_DAYS} days · ${s.onTime.posted} of ${s.onTime.due}`} />
        <StatCard label="Ad spend (running)" value={formatAmount(s.adSpendActive.actual)} hint={s.adSpendActive.planned ? `of ${formatAmount(s.adSpendActive.planned)} planned` : "no budget planned"} tone={s.adSpendActive.planned && s.adSpendActive.actual > s.adSpendActive.planned ? "danger" : "default"} />
      </Kpis>

      <Row cols={3}>
        <ChartCard title="Posting on time" subtitle={`Posts dated in the last ${ON_TIME_DAYS} days`}>
          <div className="flex justify-center py-2">
            <ProgressRing value={s.onTime.posted} target={s.onTime.due || null} label="Posted on their date" caption={s.onTime.due ? undefined : "nothing was due"} />
          </div>
        </ChartCard>
        <ChartCard title="Posts published" subtitle="Per month, last six months" href="/marketing/social-calendar" linkLabel="Social calendar" className="lg:col-span-2">
          <BarChart label="Posts published per month" data={s.postedMonthly.map((m) => ({ label: m.label, value: m.count }))} color="var(--chart-4)" />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="In production" subtitle="Upcoming posts by where they are">
          <HBarList label="Upcoming posts by production status" empty="Nothing in production." items={s.pipeline.filter((p) => p.count > 0).map((p) => ({ label: p.label, value: p.count }))} color="var(--chart-2)" />
        </ChartCard>
        <ChartCard title="Platforms" subtitle="Posts in the last 90 days">
          <DonutChart label="Posts by platform" centerLabel="posts" slices={s.platforms.map((p) => ({ label: p.label, value: p.count }))} />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title={`Coming up in ${UPCOMING_DAYS} days`} href="/marketing/social-calendar" linkLabel="Social calendar">
          <LinkList
            empty="Nothing scheduled this week."
            items={s.upcoming.map((p) => ({ key: p.id, href: "/marketing/social-calendar", label: `${p.date} · ${p.title}`, detail: p.statusLabel, tone: p.status === "approved" || p.status === "scheduled" ? "success" : "warning" }))}
          />
        </ChartCard>
        <ChartCard title="Missed" subtitle="The date passed and it did not go out">
          <LinkList empty="No missed posts." items={s.missed.map((p) => ({ key: p.id, href: "/marketing/social-calendar", label: `${p.date} · ${p.title}`, detail: p.statusLabel, tone: "danger" }))} />
        </ChartCard>
      </Row>

      <ChartCard title="Ads running now" subtitle="Spent against planned" href="/marketing/ad-campaigns" linkLabel="Ad campaigns">
        <HBarList
          label="Ad campaigns running now, spend against plan"
          empty="No ad campaigns running."
          items={s.ads.map((a) => ({
            label: a.name,
            value: a.actual,
            of: a.planned || null,
            tone: a.planned && a.actual > a.planned ? "danger" : a.planned && a.actual >= a.planned * 0.9 ? "warning" : "success",
            detail: a.planned ? `${formatAmount(a.actual)} / ${formatAmount(a.planned)}` : formatAmount(a.actual),
          }))}
        />
      </ChartCard>
    </div>
  );
}

/**
 * Lead generation (Marketing): how many leads arrived and from where, how
 * many of each month's leads have since registered, what each campaign cost
 * per lead and per registration, and the events coming up.
 */
export async function LeadGenView({ db }: { db: SupabaseClient }) {
  const today = karachiToday();
  const months = recentMonths(6);
  const rows = await loadLeadGenRows(db, { months });
  const s = summarizeLeadGen({ ...rows, months, today });
  const sources = summarizeSales({ leads: rows.leads, calls: [], months, today }).sources;

  return (
    <div className="flex flex-col gap-4" data-dashboard-view="leadgen">
      <Kpis>
        <StatCard label="Leads this month" value={s.leadsThisMonth} tone="success" trend={versus(s.leadsThisMonth, s.leadsLastMonth)} />
        <StatCard label="Not yet with a counsellor" value={s.unassigned} tone={s.unassigned ? "warning" : "default"} hint="open leads nobody is assigned" />
        <StatCard label="Referral incentives owed" value={s.referralsOwed.count} hint={s.referralsOwed.count ? formatAmount(s.referralsOwed.amount) : undefined} />
        <StatCard label="Upcoming events" value={s.upcomingEventCount} hint={s.upcomingEvents[0] ? `next ${s.upcomingEvents[0].date}` : undefined} />
      </Kpis>

      <ChartCard title="Leads and what became of them" subtitle="Leads per month, and how many of each month's leads have since registered">
        <TrendChart
          label="Leads received per month and how many registered"
          labels={s.monthly.map((m) => m.label)}
          series={[
            { name: "Leads", values: s.monthly.map((m) => m.leads), color: "var(--chart-2)" },
            { name: "Registered since", values: s.monthly.map((m) => m.registered), color: "var(--chart-1)" },
          ]}
        />
      </ChartCard>

      <Row>
        <ChartCard title="Where leads come from" subtitle={`Last ${RECENT_DAYS} days, with how many registered`}>
          <HBarList label="Leads by source" empty="No leads in this period." items={sources.map((x) => ({ label: x.source, value: x.leads, detail: `${x.leads} · ${x.registered} registered` }))} color="var(--chart-4)" />
        </ChartCard>
        <ChartCard title="Campaigns" subtitle="Leads each brought in, and the cost per lead" href="/marketing/campaigns" linkLabel="Campaigns">
          <HBarList
            label="Leads per campaign"
            empty="No campaign has brought in a lead yet."
            items={s.campaigns.map((c) => ({
              label: c.name,
              value: c.leads,
              detail: `${c.leads} · ${c.registered} reg.${c.costPerLead === null ? "" : ` · ${formatAmount(c.costPerLead)}/lead`}`,
            }))}
            color="var(--chart-3)"
          />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="Events coming up" href="/marketing/campaigns" linkLabel="Campaigns">
          <LinkList empty="No events scheduled." items={s.upcomingEvents.map((e) => ({ key: e.id, href: "/marketing/campaigns", label: e.name, detail: e.date }))} />
        </ChartCard>
        <ChartCard title="Cost per registration" subtitle="Campaigns with spend recorded">
          <BarChart
            label="Cost per registration by campaign"
            data={s.campaigns.filter((c) => c.costPerRegistration !== null).map((c) => ({ label: c.name, value: c.costPerRegistration ?? 0 }))}
            format={(n) => formatAmount(n)}
            color="var(--chart-5)"
          />
        </ChartCard>
      </Row>
    </div>
  );
}
