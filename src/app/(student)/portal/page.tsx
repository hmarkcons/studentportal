import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { EmptyState } from "@/components/ui/EmptyState";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { loadPortalSummary } from "@/lib/portalSummary";
import { PortalAttention } from "@/components/PortalAttention";
import { WHATSAPP_LINK } from "@/lib/constants";
import { ProgramDates } from "@/components/ProgramDates";
import { karachiToday } from "@/lib/calendarDates";
import { sortRounds, type ProgramRound } from "@/lib/programRounds";
import { ChartCard, NoData } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { DonutChart } from "@/components/charts/DonutChart";
import { JourneyTracker } from "@/components/studentDashboard/JourneyTracker";
import { UpcomingTimeline } from "@/components/studentDashboard/UpcomingTimeline";
import { studentJourney, upcomingTimeline, daysLeftLabel, type TimelineInput } from "@/lib/studentJourney";
import { loadCycleDocuments, documentCounts } from "@/lib/studentCycleDocuments";
import { visaOutcomes } from "@/lib/studentVisaApproval";
import { formatFee } from "@/lib/applicationFee";
import { formatDateOnly } from "@/lib/formatDate";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const stageLabel = (stage: string) =>
  stage
    .split("_")
    .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
    .join(" ");

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

type DestinationEmbed = { id?: string; display_name?: string; pipeline_stages?: string[]; dashboard_pipeline_stages?: DashboardStageDef[] };

export default async function PortalDashboardPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase
    .from("students")
    // mobile_official, not phone: 0285 withholds staff.phone and
    // whatsapp_number from signed-in users, and asking for either made this
    // whole query fail — the student found no row of their own and the
    // dashboard rendered blank. The office number is the one to give a student.
    .select("id, full_name, student_code, intake, assigned_counselor:staff!assigned_counselor_id(full_name, designation, mobile_official)")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [{ data: applications }, summary, { data: leadDestinations }, { data: agreements }, cycleDocs, visas, { data: scholarships }] =
    await Promise.all([
      supabase
        .from("applications")
        .select(
          "id, current_stage, intake, round_id, is_finalized, university:universities(name, destination:destinations(id, display_name, pipeline_stages, dashboard_pipeline_stages)), program:programs(name, rounds:program_intake_rounds(id, label, start_date, application_deadline, sort_order))"
        )
        .eq("student_id", student.id),
      loadPortalSummary(supabase, student.id),
      supabase
        .from("lead_destinations")
        .select("destination_id, dashboard_stage_values, destination:destinations(display_name, dashboard_pipeline_stages)")
        .eq("lead_id", student.id),
      supabase.from("agreements").select("status").eq("student_id", student.id),
      // The same rows the Documents page counts — see studentCycleDocuments.
      loadCycleDocuments(supabase, student.id),
      // The Visa tab's own reading of the outcome field.
      visaOutcomes(supabase, student.id),
      supabase.from("student_scholarships").select("name, status, application_deadline").eq("student_id", student.id),
    ]);

  const counselor = one(student.assigned_counselor);
  // Read on the server so dates are judged on Karachi's business day rather
  // than wherever the student is, and so no component reads the clock.
  const today = karachiToday();

  // ------------------------------------------------------------ the journey
  const approved = visas.filter((v) => v.decision === "approved");
  const refused = visas.filter((v) => v.decision === "refused");
  let travel: { total: number; done: number } | null = null;
  if (approved.length > 0) {
    const [{ data: sections }, { data: checks }] = await Promise.all([
      supabase
        .from("travel_guide_sections")
        .select("destination_id, items:travel_guide_items(id)")
        .in("destination_id", approved.map((a) => a.destinationId)),
      supabase.from("student_travel_checks").select("item_id").eq("student_id", student.id),
    ]);
    const itemIds = (sections ?? []).flatMap((s) => ((s.items ?? []) as { id: string }[]).map((i) => i.id));
    const checked = new Set((checks ?? []).map((c) => c.item_id as string));
    travel = { total: itemIds.length, done: itemIds.filter((id) => checked.has(id)).length };
  }

  const docs = documentCounts(cycleDocs.docs);
  const apps = (applications ?? []).map((a) => {
    const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as DestinationEmbed | null) : null;
    const program = one(a.program as never) as { name?: string; rounds?: ProgramRound[] } | null;
    return { app: a, uni, dest, program };
  });

  const journey = studentJourney({
    studentCode: student.student_code,
    agreement: {
      signed: (agreements ?? []).some((a) => a.status === "signed"),
      started: (agreements ?? []).length > 0,
    },
    documents: docs,
    applications: apps.map(({ app, uni, dest }) => ({
      stage: app.current_stage,
      stages: dest?.pipeline_stages ?? [],
      finalized: Boolean(app.is_finalized),
      university: uni?.name ?? "your university",
    })),
    visa: { approved: approved.map((v) => v.country), refused: refused.map((v) => v.country) },
    travel,
  });

  // ------------------------------------------------------ what is coming up
  const dated: TimelineInput[] = [];
  for (const { app, uni, program } of apps) {
    // The round this application is for, or else the next one still open.
    const rounds = sortRounds(program?.rounds ?? []);
    const round = rounds.find((r) => r.id === app.round_id) ?? rounds.find((r) => r.application_deadline && r.application_deadline >= today);
    if (round?.application_deadline) {
      dated.push({
        date: round.application_deadline,
        kind: "deadline",
        label: `Applications close — ${uni?.name ?? "University"}`,
        detail: program?.name ?? undefined,
        href: `/portal/applications/${app.id}`,
      });
    }
  }
  for (const i of summary.money?.unpaid ?? []) {
    if (!i.dueDate) continue;
    dated.push({
      date: i.dueDate,
      kind: "payment",
      label: `Instalment ${i.installmentNo || ""} — ${formatFee(i.amount, summary.money!.currency)}`.replace("Instalment  —", "Instalment —"),
      href: "/portal/payments",
    });
  }
  for (const a of summary.upcomingAppointments) {
    dated.push({ date: a.date, kind: "appointment", label: a.label, detail: a.where || a.country, href: "/portal/appointments" });
  }
  for (const d of cycleDocs.docs) {
    if (!d.deadline || (d.status !== "missing" && d.status !== "rejected")) continue;
    const template = one(d.template as never) as { name?: string } | null;
    dated.push({ date: d.deadline, kind: "document", label: `Upload ${d.custom_name ?? template?.name ?? "a document"}`, href: "/portal/documents" });
  }
  if (summary.passport.expiry && (summary.passport.state === "expiring" || summary.passport.state === "expired")) {
    dated.push({ date: summary.passport.expiry, kind: "passport", label: "Your passport expires", href: "/portal/profile" });
  }
  for (const s of scholarships ?? []) {
    if (!s.application_deadline || s.status === "accepted" || s.status === "rejected") continue;
    dated.push({ date: s.application_deadline, kind: "scholarship", label: `Scholarship deadline — ${s.name}`, href: "/portal/scholarship" });
  }
  const timeline = upcomingTimeline(dated, today);

  // ------------------------------------------------ applications by stage
  const byStage = new Map<string, number>();
  for (const { app } of apps) {
    const key = app.current_stage ? stageLabel(app.current_stage) : "Not started";
    byStage.set(key, (byStage.get(key) ?? 0) + 1);
  }

  // Destination-level grouping, as on the staff Dashboard: one card per
  // destination the student has an application to, or chose at registration.
  const savedValuesByDestinationId = new Map<string, Record<string, string>>(
    (leadDestinations ?? []).map((sd) => [sd.destination_id, (sd.dashboard_stage_values as Record<string, string> | null) ?? {}])
  );
  const destinationGroups = new Map<string, { destinationName: string; stages: DashboardStageDef[]; universityNames: string[] }>();
  for (const { uni, dest } of apps) {
    if (!dest?.id) continue;
    if (!destinationGroups.has(dest.id)) {
      destinationGroups.set(dest.id, { destinationName: dest.display_name ?? "Destination", stages: dest.dashboard_pipeline_stages ?? [], universityNames: [] });
    }
    destinationGroups.get(dest.id)!.universityNames.push(uni?.name ?? "University");
  }
  for (const sd of leadDestinations ?? []) {
    if (destinationGroups.has(sd.destination_id)) continue;
    const dest = one(sd.destination as never) as { display_name?: string; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
    if (!dest) continue;
    destinationGroups.set(sd.destination_id, { destinationName: dest.display_name ?? "Destination", stages: dest.dashboard_pipeline_stages ?? [], universityNames: [] });
  }
  const destinationPipelineRows = Array.from(destinationGroups.entries())
    .filter(([, group]) => group.stages.length > 0)
    .map(([destinationId, group]) => ({
      destinationId,
      destinationName: group.destinationName,
      applicationSummary:
        group.universityNames.length === 0
          ? "No application yet"
          : group.universityNames.length === 1
            ? group.universityNames[0]
            : `${group.universityNames.length} applications`,
      stages: group.stages,
      values: savedValuesByDestinationId.get(destinationId) ?? {},
    }));

  const money = summary.money;
  const firstName = student.full_name.split(" ")[0] || student.full_name;
  const nextAppointment = summary.nextAppointment;
  const profileDone = summary.profileTotal - summary.profileMissing;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Welcome back, {firstName}</h2>
          <p className="text-sm text-muted">Here is where everything stands with your study abroad plan.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {student.student_code && (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-ink" data-student-code>
              🎫 {student.student_code}
            </span>
          )}
          {student.intake && <span className="rounded-full border border-border bg-card px-3 py-1 text-ink">📆 {student.intake} intake</span>}
        </div>
      </div>

      <JourneyTracker journey={journey} />

      {/* The four figures a student checks most, each against its whole. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Documents" subtitle={cycleDocs.showCycleTabs ? "This intake" : undefined} href="/portal/documents" linkLabel="Open">
          <div data-kpi="documents">
            {docs.total === 0 ? (
              <NoData>Your document list is being prepared.</NoData>
            ) : (
              <ProgressRing
                value={docs.verified}
                target={docs.total}
                label="Approved"
                caption={
                  docs.waiting > 0 ? `${docs.waiting} waiting for you` : docs.inReview > 0 ? `${docs.inReview} being checked` : "All in order"
                }
                tone={docs.waiting > 0 ? "warning" : undefined}
              />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Payments" href="/portal/payments" linkLabel="Open">
          <div data-kpi="payments">
            {!money || money.total === 0 ? (
              <NoData>No invoice yet.</NoData>
            ) : (
              <ProgressRing
                value={Math.round((money.paid / money.total) * 100)}
                label={`${formatFee(money.paid, money.currency)} of ${formatFee(money.total, money.currency)} paid`}
                caption={
                  money.outstanding <= 0
                    ? "Paid in full"
                    : money.nextDueDate
                      ? `${money.overdue ? "Overdue since" : "Next due"} ${formatDateOnly(money.nextDueDate, LONG_DATE)}`
                      : `${formatFee(money.outstanding, money.currency)} to pay`
                }
                tone={money.overdue ? "danger" : money.outstanding <= 0 ? "success" : undefined}
              />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Profile" href="/portal/profile" linkLabel="Open">
          <div data-kpi="profile">
            <ProgressRing
              value={profileDone}
              target={summary.profileTotal || null}
              label="Details complete"
              caption={
                summary.passport.state === "expired"
                  ? "Your passport has expired"
                  : summary.passport.state === "expiring"
                    ? "Your passport expires soon"
                    : summary.profileMissing > 0
                      ? `${summary.profileMissing} still needed for your visa`
                      : "Ready for your visa"
              }
              tone={summary.passport.state === "expired" ? "danger" : summary.profileMissing > 0 ? "warning" : undefined}
            />
          </div>
        </ChartCard>

        <ChartCard title="Next appointment" href="/portal/appointments" linkLabel="All">
          <div data-kpi="appointment" className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
            {nextAppointment ? (
              <>
                <p className="text-4xl font-bold leading-none text-primary">
                  {summary.daysToAppointment === 0 ? "Today" : summary.daysToAppointment}
                </p>
                {summary.daysToAppointment !== 0 && (
                  <p className="text-xs uppercase tracking-wide text-muted">{summary.daysToAppointment === 1 ? "day to go" : "days to go"}</p>
                )}
                <p className="mt-2 text-sm font-medium text-ink">{nextAppointment.label}</p>
                <p className="text-xs text-muted">{formatDateOnly(nextAppointment.date, LONG_DATE)}</p>
              </>
            ) : (
              <NoData>No appointment booked.</NoData>
            )}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Everything outstanding — documents, money, appointments, replies —
            each computed by the helper its own page uses. */}
        <PortalAttention summary={summary} className="h-full" />
        <ChartCard title="Your applications by stage" subtitle={`${apps.length} application${apps.length === 1 ? "" : "s"}`}>
          {apps.length === 0 ? (
            <NoData>No applications yet — your counsellor adds them once your documents are ready.</NoData>
          ) : (
            <DonutChart
              slices={[...byStage.entries()].map(([label, value]) => ({ label, value }))}
              centerLabel={apps.length === 1 ? "application" : "applications"}
              label="Applications by stage"
            />
          )}
        </ChartCard>
      </div>

      {/* Applications beside their countries' progress: two columns that
          each fill, rather than two half-empty rows. */}
      <div className={destinationPipelineRows.length > 0 ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-2" : ""}>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Your applications</h3>
        {apps.length === 0 ? (
          <Card>
            <EmptyState>No applications yet.</EmptyState>
          </Card>
        ) : (
          <div className={`grid grid-cols-1 gap-4 ${destinationPipelineRows.length > 0 ? "" : "xl:grid-cols-2"}`}>
            {apps.map(({ app, uni, dest, program }) => {
              // The round's own label, so two applications to one programme in
              // different rounds do not read as the same card twice.
              const roundLabel = (program?.rounds ?? []).find((r) => r.id === app.round_id)?.label ?? null;
              return (
                <div key={app.id} className="flex flex-col gap-1">
                  <Link href={`/portal/applications/${app.id}`}>
                    <BoardingPassTracker
                      universityName={uni?.name ?? "University"}
                      programName={program?.name}
                      intake={app.intake}
                      round={roundLabel}
                      currentStage={app.current_stage}
                      pipelineStages={dest?.pipeline_stages ?? []}
                    />
                  </Link>
                  <ProgramDates rounds={program?.rounds ?? []} today={today} highlightRoundId={app.round_id} className="px-1" />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {destinationPipelineRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Progress by country</h3>
          <div className="grid grid-cols-1 gap-4">
            {destinationPipelineRows.map((row) => (
              <DestinationPipelineCard
                key={row.destinationId}
                leadId={student.id}
                destinationId={row.destinationId}
                destinationName={row.destinationName}
                subtitle={row.applicationSummary}
                stages={row.stages}
                values={row.values}
                editable={false}
                revalidateTo="/portal"
              />
            ))}
          </div>
        </section>
      )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Coming up"
          subtitle={timeline[0] ? `Next: ${timeline[0].label}, ${daysLeftLabel(timeline[0].daysLeft)}` : "Deadlines, payments and appointments"}
          className="lg:col-span-2"
        >
          <UpcomingTimeline entries={timeline} />
        </ChartCard>

        <ChartCard title="Your counsellor">
          {counselor ? (
            <div className="flex flex-col gap-3" data-counsellor>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
                  {String(counselor.full_name ?? "")
                    .split(" ")
                    .map((w: string) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{counselor.full_name}</span>
                  <span className="block text-xs text-muted">{counselor.designation ?? "Counsellor"}</span>
                </span>
              </div>
              {/* Tappable: a student on a phone should not copy a number out by hand. */}
              <div className="flex flex-wrap gap-2">
                {counselor.mobile_official && (
                  <a
                    href={`tel:${counselor.mobile_official.replace(/[^+\d]/g, "")}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-bg"
                  >
                    📞 {counselor.mobile_official}
                  </a>
                )}
                <a href={WHATSAPP_LINK} className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10">
                  💬 WhatsApp HMARK
                </a>
                <Link href="/portal/messages" className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-bg">
                  ✉️ Message
                </Link>
              </div>
            </div>
          ) : (
            <NoData>A counsellor will be assigned to you shortly.</NoData>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
