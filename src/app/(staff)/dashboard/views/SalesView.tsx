import type { SupabaseClient } from "@supabase/supabase-js";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard, NoData } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { TrendChart } from "@/components/charts/TrendChart";
import { HBarList } from "@/components/charts/HBarList";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { karachiToday } from "@/lib/calendarDates";
import { recentMonths } from "@/lib/leadOwners";
import { stageSnapshot } from "@/lib/stageProgress";
import { counselorLeaderboard, summarizeSales, FOLLOW_UP_AFTER_DAYS, RECENT_DAYS } from "@/lib/dashboards/sales";
import { loadCounselors, loadFollowUpTasks, loadSalesRows, loadStudentProgress } from "@/lib/dashboards/load";
import { days, Kpis, LinkList, Row, versus } from "./shared";

/**
 * Sales: from enquiry to registration. A counsellor sees their own leads —
 * the database hands them nothing else — and, below, how their registered
 * students are getting on, read-only. Management sees the whole team.
 */
export async function SalesView({ db, staffId, team }: { db: SupabaseClient; staffId: string; team: boolean }) {
  const today = karachiToday();
  const months = recentMonths(6);
  const [{ leads, calls }, me, tasks, progress, counselors] = await Promise.all([
    loadSalesRows(db, { counselorId: team ? null : staffId, today }),
    team ? Promise.resolve({ data: null }) : db.from("staff").select("monthly_target").eq("id", staffId).maybeSingle(),
    team ? Promise.resolve([]) : loadFollowUpTasks(db, staffId, today),
    team ? Promise.resolve(null) : loadStudentProgress(db, staffId),
    team ? loadCounselors(db) : Promise.resolve([]),
  ]);
  const s = summarizeSales({ leads, calls, months, today });
  const target = (me.data as { monthly_target?: number | null } | null)?.monthly_target ?? null;
  const board = team ? counselorLeaderboard(counselors, leads, today.slice(0, 7)) : [];
  const teamTarget = board.reduce((a, r) => a + (r.target ?? 0), 0) || null;

  // Registered students by how far they have got, stuck ones first.
  const studentRows = (progress?.rows ?? []).map((r) => ({ ...r, snap: stageSnapshot(r.stages, r.values) }));
  const inProgress = studentRows.filter((r) => !r.snap.complete);
  const byStage = new Map<string, number>();
  for (const r of inProgress) byStage.set(r.snap.currentLabel, (byStage.get(r.snap.currentLabel) ?? 0) + 1);
  const attention = [...inProgress].sort((a, b) => Number(b.snap.blocked) - Number(a.snap.blocked) || a.snap.done / (a.snap.total || 1) - b.snap.done / (b.snap.total || 1));

  return (
    <div className="flex flex-col gap-4" data-dashboard-view={team ? "sales_team" : "sales"}>
      <Kpis>
        <StatCard label="Registered this month" value={s.registeredThisMonth} tone="success" trend={versus(s.registeredThisMonth, s.registeredLastMonth)} hint={team ? (teamTarget ? `team target ${teamTarget}` : undefined) : target ? `target ${target}` : "no target set"} />
        <StatCard label="Open leads" value={s.openLeads} hint={`${s.newLeadsThisMonth} new this month${s.parkedLeads ? ` · ${s.parkedLeads} waiting for a later intake` : ""}`} />
        <StatCard label="Due a call" value={s.followUpsDue} tone={s.followUpsDue ? "warning" : "default"} hint={`no contact for ${FOLLOW_UP_AFTER_DAYS}+ days`} />
        <StatCard label="Conversion" value={s.conversion.rate === null ? "—" : `${s.conversion.rate}%`} hint={`of the last ${RECENT_DAYS} days' leads`} />
      </Kpis>

      <Row cols={3}>
        <ChartCard title={team ? "Team against target" : "This month's target"} subtitle={today.slice(0, 7)}>
          <div className="flex justify-center py-2">
            <ProgressRing value={s.registeredThisMonth} target={team ? teamTarget : target} label="Registrations" caption={(team ? teamTarget : target) ? undefined : "no target set"} />
          </div>
        </ChartCard>
        <ChartCard title="Leads and registrations" subtitle="Last six months" className="lg:col-span-2">
          <TrendChart
            label="Leads received and students registered per month"
            labels={s.monthly.map((m) => m.label)}
            series={[
              { name: "Registered", values: s.monthly.map((m) => m.registered) },
              { name: "New leads", values: s.monthly.map((m) => m.newLeads) },
            ]}
          />
        </ChartCard>
      </Row>

      {team && (
        <ChartCard title="Counsellors this month" subtitle="Registrations against each counsellor's target" href="/leads" linkLabel="Leads">
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
      )}

      <Row>
        <ChartCard title="Pipeline" subtitle="Open leads by where they stand" href="/leads" linkLabel="Leads">
          <HBarList label="Open leads by status" empty="No open leads." items={s.pipeline.map((p) => ({ label: p.label, value: p.count }))} color="var(--chart-2)" />
        </ChartCard>
        <ChartCard title="Where leads come from" subtitle={`Last ${RECENT_DAYS} days, with how many registered`}>
          <HBarList
            label="Leads by source"
            empty="No leads in this period."
            items={s.sources.map((x) => ({ label: x.source, value: x.leads, detail: `${x.leads} · ${x.registered} registered` }))}
            color="var(--chart-4)"
          />
        </ChartCard>
      </Row>

      <Row>
        <ChartCard title="Enquiry to registration" subtitle={`Leads received in the last ${RECENT_DAYS} days`}>
          <FunnelChart label="Leads received, contacted, met and registered" stages={s.funnel} />
        </ChartCard>
        <ChartCard title="Due a call" subtitle={`Open leads with no contact for ${FOLLOW_UP_AFTER_DAYS} days or more`} href="/leads" linkLabel="All leads">
          <LinkList
            empty="Everyone has been contacted recently."
            items={s.followUps.map((f) => ({ key: f.id, href: `/leads/${f.id}`, label: f.name, detail: `${f.statusLabel} · ${days(f.daysSince)}`, tone: f.daysSince >= 7 ? "danger" : "warning" }))}
          />
        </ChartCard>
      </Row>

      {!team && (
        <>
          <Row>
            <ChartCard title="Follow-up tasks due" subtitle="Yours, due today or earlier" href="/calendar" linkLabel="Calendar">
              <LinkList
                empty="No follow-up tasks due."
                items={tasks.map((t) => ({ key: t.id as string, href: t.student_id ? `/students/${t.student_id}` : "/calendar", label: (t.title as string) || "Follow-up", detail: String(t.due_date ?? ""), tone: "warning" }))}
              />
            </ChartCard>
            <ChartCard title="My registered students" subtitle={`${progress?.students ?? 0} registered · where each is now`} href="/students" linkLabel="Students">
              {inProgress.length === 0 ? (
                <NoData>{progress?.students ? "Every registered student has completed their stages." : "No registered students yet."}</NoData>
              ) : (
                <HBarList label="Registered students by current stage" items={[...byStage.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} color="var(--chart-1)" />
              )}
            </ChartCard>
          </Row>
          {attention.length > 0 && (
            <ChartCard title="Their progress" subtitle="Stuck first, then the least far along. Processing records these — you can follow them.">
              <LinkList
                empty=""
                items={attention.slice(0, 10).map((r) => ({
                  key: `${r.studentId}-${r.destinationName}`,
                  href: `/students/${r.studentId}`,
                  label: `${r.studentName} · ${r.destinationName}`,
                  detail: r.snap.blocked && r.snap.latest ? r.snap.latest : `${r.snap.done}/${r.snap.total} · ${r.snap.currentLabel}`,
                  tone: r.snap.blocked ? "danger" : "muted",
                }))}
              />
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}
