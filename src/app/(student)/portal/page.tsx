import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { loadPortalSummary } from "@/lib/portalSummary";
import { PortalAttention } from "@/components/PortalAttention";
import { WHATSAPP_LINK } from "@/lib/constants";
import { karachiToday } from "@/lib/calendarDates";
import { sortRounds } from "@/lib/programRounds";
import { loadStudentApplications } from "@/lib/studentApplications";
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

export default async function PortalDashboardPage() {
  const { supabase, userId } = await getStudentUser();

  const { data: student } = await supabase
    .from("students")
    // mobile_official, not phone: 0285 withholds staff.phone and
    // whatsapp_number from signed-in users, and asking for either made this
    // whole query fail — the student found no row of their own and the
    // dashboard rendered blank. The office number is the one to give a student.
    .select(
      "id, full_name, student_code, intake, assigned_counselor:staff!assigned_counselor_id(full_name, designation, mobile_official), processing_officer:staff!processing_officer_id(full_name, designation, mobile_official)"
    )
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [apps, summary, { data: agreements }, cycleDocs, visas, { data: scholarships }] =
    await Promise.all([
      // The applications have a page of their own now; the dashboard keeps
      // what it needs for the journey, the chart and what is coming up.
      loadStudentApplications(supabase, student.id),
      loadPortalSummary(supabase, student.id),
      supabase.from("agreements").select("status").eq("student_id", student.id),
      // The same rows the Documents page counts — see studentCycleDocuments.
      loadCycleDocuments(supabase, student.id),
      // The Visa tab's own reading of the outcome field.
      visaOutcomes(supabase, student.id),
      supabase.from("student_scholarships").select("name, status, application_deadline").eq("student_id", student.id),
    ]);

  const counselor = one(student.assigned_counselor) as TeamPerson;
  const processingOfficer = one(student.processing_officer) as TeamPerson;
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
        <ChartCard
          title="Your applications by stage"
          subtitle={`${apps.length} application${apps.length === 1 ? "" : "s"}`}
          href="/portal/applications"
          linkLabel="View applications"
        >
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Coming up"
          subtitle={timeline[0] ? `Next: ${timeline[0].label}, ${daysLeftLabel(timeline[0].daysLeft)}` : "Deadlines, payments and appointments"}
          className="lg:col-span-2"
        >
          <UpcomingTimeline entries={timeline} />
        </ChartCard>

        {/* Both people who look after them: the counsellor who guides the
            plan, and the processing officer who files the applications and
            the visa. Either may not be assigned yet, and says so. */}
        <ChartCard title="Your HMARK team">
          <div className="flex flex-col gap-4" data-team>
            <TeamMember person={counselor} role="Your counsellor" pending="A counsellor will be assigned to you shortly." marker="counsellor" />
            <TeamMember
              person={processingOfficer}
              role="Your processing officer"
              pending="A processing officer is assigned once your applications begin."
              marker="processing-officer"
            />
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <a href={WHATSAPP_LINK} className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10">
                💬 WhatsApp HMARK
              </a>
              <Link href="/portal/messages" className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-bg">
                ✉️ Message
              </Link>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

type TeamPerson = { full_name?: string | null; designation?: string | null; mobile_official?: string | null } | null;

/** One of the student's two people: initials, name, what they do, and a number to tap. */
function TeamMember({ person, role, pending, marker }: { person: TeamPerson; role: string; pending: string; marker: string }) {
  if (!person?.full_name) {
    return (
      <div className="flex items-center gap-3" data-team-member={marker} data-assigned="no">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-lg text-muted">?</span>
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted">{role}</span>
          <span className="block text-xs text-muted">{pending}</span>
        </span>
      </div>
    );
  }
  const initials = person.full_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-team-member={marker} data-assigned="yes">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">{initials}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{role}</span>
          <span className="block text-sm font-medium text-ink">{person.full_name}</span>
          {person.designation && <span className="block text-xs text-muted">{person.designation}</span>}
        </span>
      </div>
      {/* Tappable: a student on a phone should not copy a number out by hand. */}
      {person.mobile_official && (
        <a
          href={`tel:${person.mobile_official.replace(/[^+\d]/g, "")}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-bg"
        >
          📞 {person.mobile_official}
        </a>
      )}
    </div>
  );
}
