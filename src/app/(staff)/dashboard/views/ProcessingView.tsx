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
import { DEADLINE_WINDOW_DAYS, officerTable, summarizeProcessing, TURNAROUND_DAYS } from "@/lib/dashboards/processing";
import { loadOfficers, loadProcessingRows } from "@/lib/dashboards/load";
import { days, Kpis, LinkList, Row } from "./shared";

const OUTCOME_COLORS: Record<string, string> = {
  pending: "var(--chart-6)",
  submitted: "var(--chart-2)",
  with_offer: "var(--success)",
  rejected: "var(--danger)",
  not_eligible: "var(--chart-5)",
  withdrawn: "var(--chart-3)",
};

/**
 * Processing: admissions, documents, visa and scholarship for registered
 * students. An officer sees the students they are the processing officer for;
 * Management sees the whole team, officer by officer.
 *
 * `restricted` reads visa decisions and scholarships — see loadProcessingRows.
 */
export async function ProcessingView({
  db,
  restricted,
  staffId,
  team,
}: {
  db: SupabaseClient;
  restricted: SupabaseClient;
  staffId: string;
  team: boolean;
}) {
  const today = karachiToday();
  const months = recentMonths(6);
  const [rows, officers] = await Promise.all([
    loadProcessingRows(db, { officerId: team ? null : staffId, restricted }),
    team ? loadOfficers(db) : Promise.resolve([]),
  ]);
  const s = summarizeProcessing({ ...rows, months, today });
  const table = team ? officerTable({ officers, students: rows.students, documents: rows.documents, visas: rows.visas, today }) : [];
  const offers = s.outcomes.find((o) => o.category === "with_offer")?.count ?? 0;
  const decided = s.outcomes.filter((o) => o.category !== "pending").reduce((a, o) => a + o.count, 0);

  if (!team && s.students === 0) {
    return (
      <ChartCard title="No students assigned to you yet" subtitle="Your dashboard fills in as students are assigned to you as their processing officer.">
        <p className="text-sm text-muted">
          A student is assigned from the Registration card on their record. Until then, the processing team as a whole covers them.
        </p>
      </ChartCard>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-dashboard-view={team ? "processing_team" : "processing"}>
      <Kpis>
        <StatCard label={team ? "Registered students" : "My students"} value={s.students} hint={`${s.completeCount} through every stage`} />
        <StatCard label="Documents to review" value={s.docsWaiting} tone={s.docsWaiting ? "warning" : "default"} hint={s.turnaroundDays === null ? undefined : `approved in ${days(s.turnaroundDays)} on average`} />
        <StatCard label="Deadlines coming up" value={s.deadlines.length} tone={s.deadlines.length ? "danger" : "default"} hint={`next ${DEADLINE_WINDOW_DAYS} days`} />
        <StatCard label="Visa approval rate" value={s.visaYear.rate === null ? "—" : `${s.visaYear.rate}%`} tone={s.visaYear.rate !== null && s.visaYear.rate >= 80 ? "success" : "default"} hint={`${s.visaYear.approved} approved · ${s.visaYear.refused} refused, last 12 months`} />
      </Kpis>

      <Row cols={3}>
        <ChartCard title="Visa results" subtitle="Last 12 months">
          <div className="flex justify-center py-2">
            <ProgressRing value={s.visaYear.rate} label="Approved" caption={`${s.visaYear.approved + s.visaYear.refused} decisions`} tone={s.visaYear.rate !== null && s.visaYear.rate < 60 ? "warning" : "success"} />
          </div>
        </ChartCard>
        <ChartCard title="Visa decisions by month" subtitle="Last six months" className="lg:col-span-2">
          <TrendChart
            label="Visas approved and refused per month"
            labels={s.visaMonthly.map((m) => m.label)}
            series={[
              { name: "Approved", values: s.visaMonthly.map((m) => m.approved), color: "var(--success)" },
              { name: "Refused", values: s.visaMonthly.map((m) => m.refused), color: "var(--danger)" },
            ]}
          />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="Applications" subtitle={`${offers} with an offer · ${decided ? `${Math.round((offers / decided) * 100)}% of those decided` : "none decided yet"}`} href="/applications" linkLabel="Applications">
          <DonutChart label="Applications by outcome" centerLabel="applications" slices={s.outcomes.map((o) => ({ label: o.label, value: o.count, color: OUTCOME_COLORS[o.category] }))} />
        </ChartCard>
        <ChartCard title="Where students are" subtitle="Each student's countries by the stage they are on now — a student going to two countries counts in each">
          <HBarList label="Students by current country stage" empty="Every student has completed their stages." items={s.stageMix.map((x) => ({ label: x.label, value: x.count }))} color="var(--chart-2)" />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard
          title="Documents approved"
          subtitle={s.turnaroundDays === null ? "Per month" : `Per month · on average ${days(s.turnaroundDays)} from upload to approval (last ${TURNAROUND_DAYS} days)`}
        >
          <BarChart label="Documents approved per month" data={s.reviewedMonthly.map((m) => ({ label: m.label, value: m.count }))} color="var(--chart-1)" />
        </ChartCard>
        <ChartCard title={`Deadlines in the next ${DEADLINE_WINDOW_DAYS} days`} subtitle="Applications still being prepared" href="/calendar" linkLabel="Calendar">
          <LinkList
            empty="No application deadlines in the next fortnight."
            items={s.deadlines.slice(0, 8).map((d) => ({
              key: `${d.studentId}-${d.university}-${d.due}`,
              href: `/students/${d.studentId}/applications`,
              label: `${d.studentName} · ${d.university}`,
              detail: d.days === 0 ? "today" : `in ${days(d.days)}`,
              tone: d.days <= 3 ? "danger" : "warning",
            }))}
          />
        </ChartCard>
      </Row>

      <Row cols={3}>
        <ChartCard title="Documents waiting longest" subtitle="Submitted and not yet reviewed">
          <LinkList
            empty="Nothing waiting for review."
            items={s.oldestWaiting.map((d) => ({ key: d.studentId, href: `/students/${d.studentId}/documents`, label: d.studentName, detail: days(d.days), tone: d.days >= 5 ? "danger" : "muted" }))}
          />
        </ChartCard>
        <ChartCard title="Stuck" subtitle="Latest stage is a refusal, a failure or a wait">
          <LinkList
            empty="Nobody is stuck."
            items={s.blocked.map((b) => ({ key: `${b.studentId}-${b.destination}`, href: `/students/${b.studentId}`, label: `${b.studentName} · ${b.destination}`, detail: b.latest, tone: "danger" }))}
          />
        </ChartCard>
        <ChartCard title="Scholarships" subtitle={s.scholarships.map((x) => `${x.count} ${x.label.toLowerCase()}`).join(" · ") || "None recorded"}>
          <LinkList
            empty="No scholarship deadlines in the next month."
            items={s.scholarshipDeadlines.map((x) => ({ key: `${x.studentId}-${x.name}`, href: `/students/${x.studentId}/scholarship`, label: `${x.studentName} · ${x.name}`, detail: `in ${days(x.days)}`, tone: x.days <= 7 ? "danger" : "warning" }))}
          />
        </ChartCard>
      </Row>

      {team && (
        <ChartCard title="Processing officers" subtitle="Students each carries, documents waiting on them, and their visa results over the last year">
          <HBarList
            label="Students per processing officer"
            empty="No processing officers."
            items={table.map((o) => ({
              label: o.name,
              value: o.students,
              tone: o.id === "unassigned" ? "warning" : undefined,
              detail: `${o.students} · ${o.docsWaiting} docs${o.rate === null ? "" : ` · ${o.rate}% visas`}`,
            }))}
          />
        </ChartCard>
      )}
    </div>
  );
}
