import type { SupabaseClient } from "@supabase/supabase-js";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { HBarList } from "@/components/charts/HBarList";
import { compactNumber } from "@/lib/chartMath";
import { karachiToday } from "@/lib/calendarDates";
import { recentMonths } from "@/lib/leadOwners";
import { counselorLeaderboard, summarizeSales } from "@/lib/dashboards/sales";
import { summarizeProcessing } from "@/lib/dashboards/processing";
import { summarizeFinance } from "@/lib/dashboards/finance";
import { loadCounselors, loadFinanceRows, loadProcessingRows, loadSalesRows, loadTeamToday } from "@/lib/dashboards/load";
import { approxPkr, Kpis, Row, versus } from "./shared";

/**
 * The company at a glance, for Management and Super Admin: sales, students,
 * visas, money and the team today, each linking to the tab with the detail.
 *
 * `restricted` reads visa decisions and scholarships — see loadProcessingRows.
 */
export async function OverviewView({ db, restricted }: { db: SupabaseClient; restricted: SupabaseClient }) {
  const today = karachiToday();
  const year = recentMonths(12);
  const half = year.slice(-6);
  const [{ leads, calls }, counselors, processing, finance, teamToday] = await Promise.all([
    loadSalesRows(db, { counselorId: null, today }),
    loadCounselors(db),
    loadProcessingRows(db, { officerId: null, restricted }),
    loadFinanceRows(db, { months: half }),
    loadTeamToday(db, today),
  ]);
  const sales = summarizeSales({ leads, calls, months: year, today });
  const board = counselorLeaderboard(counselors, leads, today.slice(0, 7));
  const proc = summarizeProcessing({ ...processing, months: half, today });
  const money = summarizeFinance({ ...finance, months: half, today });

  return (
    <div className="flex flex-col gap-4" data-dashboard-view="overview">
      <Kpis>
        <StatCard label="Registered this month" value={sales.registeredThisMonth} tone="success" trend={versus(sales.registeredThisMonth, sales.registeredLastMonth)} />
        <StatCard label="Open leads" value={sales.openLeads} hint={`${sales.followUpsDue} due a call`} tone={sales.followUpsDue > sales.openLeads / 2 ? "warning" : "default"} />
        <StatCard label="Students in processing" value={proc.students} hint={`${proc.docsWaiting} document${proc.docsWaiting === 1 ? "" : "s"} to review · ${proc.deadlines.length} deadline${proc.deadlines.length === 1 ? "" : "s"} in 14 days`} />
        <StatCard label="Visa approval rate" value={proc.visaYear.rate === null ? "—" : `${proc.visaYear.rate}%`} hint={`${proc.visaYear.approved} approved · ${proc.visaYear.refused} refused, 12 months`} />
      </Kpis>
      <Kpis>
        <StatCard label="Collected this month" value={approxPkr(money.collectedMonthlyPkr.at(-1)?.pkr ?? 0)} tone="success" />
        <StatCard label="Overdue" value={approxPkr(money.overduePkr)} tone={money.overdueCount ? "danger" : "default"} hint={`${money.overdueCount} instalment${money.overdueCount === 1 ? "" : "s"}`} />
        <StatCard
          label="In today"
          value={`${teamToday.present}/${teamToday.activeStaff}`}
          tone={teamToday.late ? "warning" : "default"}
          hint={`${teamToday.late} late · clocked in on Attendance`}
        />
        <StatCard label="Waiting on management" value={teamToday.leavePending} tone={teamToday.leavePending ? "warning" : "default"} hint={`leave to decide · ${teamToday.ticketsOpen} support tickets open`} />
      </Kpis>

      <ChartCard title="Leads and registrations" subtitle="Last 12 months" href="/dashboard?view=sales_team" linkLabel="Sales team">
        <TrendChart
          label="Leads received and students registered per month over the last year"
          labels={sales.monthly.map((m) => m.label)}
          series={[
            { name: "Registered", values: sales.monthly.map((m) => m.registered) },
            { name: "New leads", values: sales.monthly.map((m) => m.newLeads) },
          ]}
        />
      </ChartCard>

      <Row>
        <ChartCard title="Counsellors this month" subtitle="Against each one's target" href="/dashboard?view=sales_team" linkLabel="Sales team">
          <HBarList
            label="Registrations per counsellor this month"
            empty="No active counsellors."
            items={board.map((r) => ({
              label: r.name,
              value: r.registered,
              of: r.target,
              tone: r.target && r.registered >= r.target ? "success" : r.target ? "warning" : "muted",
              detail: r.target ? `${r.registered}/${r.target} · ${r.pct}%` : `${r.registered} · no target`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Applications" subtitle="Every registered student's applications, by outcome" href="/dashboard?view=processing_team" linkLabel="Processing team">
          <DonutChart label="Applications by outcome" centerLabel="applications" slices={proc.outcomes.map((o) => ({ label: o.label, value: o.count }))} />
        </ChartCard>
      </Row>

      <Row cols={3}>
        <ChartCard title="Visas" subtitle="Approved, last 12 months" href="/dashboard?view=processing_team" linkLabel="Processing team">
          <div className="flex justify-center py-2">
            <ProgressRing value={proc.visaYear.rate} label="Approval rate" caption={`${proc.visaYear.approved + proc.visaYear.refused} decisions`} />
          </div>
        </ChartCard>
        <ChartCard title="Money collected" subtitle="≈ PKR per month" href="/dashboard?view=finance" linkLabel="Finance" className="lg:col-span-2">
          <BarChart label="Money collected per month, approximately in PKR" data={money.collectedMonthlyPkr.map((m) => ({ label: m.label, value: m.pkr }))} format={compactNumber} />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="Where leads come from" subtitle="Last 90 days, with how many registered" href="/dashboard?view=leadgen" linkLabel="Lead generation">
          <HBarList label="Leads by source" empty="No leads in this period." items={sales.sources.map((x) => ({ label: x.source, value: x.leads, detail: `${x.leads} · ${x.registered} registered` }))} color="var(--chart-4)" />
        </ChartCard>
        <ChartCard title="Where students are" subtitle="Each student's countries, by the stage they are on now" href="/dashboard?view=processing_team" linkLabel="Processing team">
          <HBarList label="Students by current country stage" empty="Every student has completed their stages." items={proc.stageMix.map((x) => ({ label: x.label, value: x.count }))} color="var(--chart-2)" />
        </ChartCard>
      </Row>
    </div>
  );
}
