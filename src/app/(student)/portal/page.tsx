import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarClock, CalendarDays, CreditCard, FolderOpen, Globe, Headset, IdCard, Landmark, Mail, MessageCircle, Sparkles, UserRound, BookOpen } from "lucide-react";
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
import { UpcomingTimeline } from "@/components/studentDashboard/UpcomingTimeline";
import { studentJourney, upcomingTimeline, daysLeftLabel, type TimelineInput } from "@/lib/studentJourney";
import { loadCycleDocuments, documentCounts } from "@/lib/studentCycleDocuments";
import { visaOutcomes } from "@/lib/studentVisaApproval";
import { formatFee } from "@/lib/applicationFee";
import { formatDateOnly } from "@/lib/formatDate";
import { loadStudentTeam } from "@/lib/studentTeam";
import { destinationHeadline, destinationStatusRows, type RegisteredDestination } from "@/lib/destinationStatus";
import type { DashboardStageDef } from "@/lib/dashboardPipeline";
import { TeamCard } from "@/components/studentPortal/TeamCard";
import { DestinationStatusCard, countryAccent } from "@/components/studentPortal/DestinationStatusCard";

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
    .select("id, full_name, student_code, intake")
    .eq("auth_user_id", userId ?? "")
    .maybeSingle();

  if (!student) return null;

  const [apps, summary, { data: agreements }, cycleDocs, visas, { data: scholarships }, team, { data: registeredCountries }] =
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
      // Their counsellor and processing officer, as staff see them.
      loadStudentTeam(supabase, student.id),
      // Each country they registered for, primary and backups, with the
      // status staff keep on the Dashboard tab.
      supabase
        .from("lead_destinations")
        .select("destination_id, is_backup, created_at, dashboard_stage_values, destination:destinations(display_name, country_code, dashboard_pipeline_stages)")
        .eq("lead_id", student.id),
    ]);

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
  // What is still wanted from the student, each a link to the document and
  // how to prepare it — the count alone says how much, not what.
  // Sent back first, then the soonest due, then the checklist's own order —
  // the three shown are the three most in need of doing.
  const toUpload = cycleDocs.docs
    .filter((d) => d.status === "missing" || d.status === "rejected")
    .map((d, order) => ({
      id: d.id,
      name: d.custom_name ?? (one(d.template as never) as { name?: string } | null)?.name ?? "A document",
      sentBack: d.status === "rejected",
      deadline: d.deadline as string | null,
      order,
    }))
    .sort(
      (a, b) =>
        Number(b.sentBack) - Number(a.sentBack) ||
        (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") ||
        a.order - b.order
    );

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

  // ------------------------------------------------------ each country
  // One bar per country: the primary, each backup, and any country applied to
  // without registering for it. A backup runs its own process alongside the
  // primary, so it gets a bar of its own rather than being folded in.
  const countries = destinationStatusRows(
    (registeredCountries ?? []).flatMap((r): RegisteredDestination[] => {
      const d = one(r.destination as never) as { display_name?: string; country_code?: string | null; dashboard_pipeline_stages?: DashboardStageDef[] } | null;
      if (!d?.display_name) return [];
      return [
        {
          destinationId: r.destination_id as string,
          isBackup: Boolean(r.is_backup),
          createdAt: r.created_at as string | null,
          values: (r.dashboard_stage_values as Record<string, string> | null) ?? null,
          name: d.display_name,
          code: d.country_code ?? null,
          stages: d.dashboard_pipeline_stages ?? [],
        },
      ];
    }),
    apps.flatMap(({ uni, dest }) =>
      dest?.id
        ? [
            {
              destinationId: dest.id,
              name: dest.display_name ?? "Destination",
              code: dest.country_code ?? null,
              stages: dest.dashboard_pipeline_stages ?? [],
              university: uni?.name ?? "University",
            },
          ]
        : []
    )
  );
  const backups = countries.filter((c) => c.role === "backup").length;
  const primaryCountry = countries.find((c) => c.role === "primary") ?? countries[0] ?? null;

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
    // Straight to the document, its section open and its guide showing (0300).
    dated.push({ date: d.deadline, kind: "document", label: `Upload ${d.custom_name ?? template?.name ?? "a document"}`, href: `/portal/documents?guide=${d.id}` });
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
  const soonest = timeline[0] ?? null;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      {/* ------------------------------------------------------------ hero */}
      {/* ------------------------------------------------------------ hero
          The one full-colour block on the dashboard: the brand's green, with
          everything below it calm, so it is where the eye lands first. */}
      <section
        data-rise
        data-hero
        className="bg-hero-banner relative overflow-hidden rounded-3xl px-6 py-7 text-white shadow-xl shadow-[var(--banner-to)]/20 sm:px-8"
      >
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-white/10" />
        <span aria-hidden className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">Your study abroad plan</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {firstName}</h2>
            {/* What to do next — the one thing the seven-step tracker said that
                the country bars below do not, since it is about the student's
                own part: documents to send, an agreement to sign. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2" data-journey-next>
              <p className="text-sm text-white/90">
                {journey.next
                  ? journey.next.state === "blocked"
                    ? `${journey.next.label} needs attention — ${journey.next.detail}`
                    : `Right now: ${journey.next.label} — ${journey.next.detail}`
                  : "Every step is done. Safe travels — we are proud of you!"}
              </p>
              {journey.next?.href && (
                <Link
                  prefetch={false}
                  href={journey.next.href}
                  className="inline-flex w-fit items-center gap-1 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-[var(--banner-to)] shadow-sm hover:bg-white/90"
                >
                  Continue
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
                </Link>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {student.student_code && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium ring-1 ring-white/25 backdrop-blur-sm" data-student-code>
                  <IdCard aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {student.student_code}
                </span>
              )}
              {student.intake && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium ring-1 ring-white/25 backdrop-blur-sm">
                  <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {student.intake} intake
                </span>
              )}
              {primaryCountry && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium ring-1 ring-white/25 backdrop-blur-sm">
                  <Globe aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {primaryCountry.name}
                  {backups > 0 && ` · ${backups} backup${backups === 1 ? "" : "s"}`}
                </span>
              )}
            </div>
          </div>

          {/* The one dated thing nearest to now, where it is seen first. */}
          <Link
            prefetch={false}
            href={soonest?.href ?? "/portal/appointments"}
            className="relative flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/25 backdrop-blur-md transition hover:bg-white/20 sm:w-auto"
            data-hero-next
          >
            <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl">
              {soonest ? <AlarmClock className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/80">
                {soonest ? `Next · ${daysLeftLabel(soonest.daysLeft)}` : "Coming up"}
              </span>
              <span className="block truncate text-sm font-semibold">{soonest ? soonest.label : "Nothing due soon — you are on track"}</span>
              {soonest && <span className="block text-xs text-white/80">{formatDateOnly(soonest.date, LONG_DATE)}</span>}
            </span>
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------ the journey
          One status bar per country — the primary first, then each backup —
          under the heading the seven-step tracker used to have. That tracker
          said much the same thing less precisely, once, for every country
          together; these are the steps staff actually record, country by
          country. */}
      <section className="flex flex-col gap-3" data-journey>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Your journey</h3>
            <p className="text-lg font-semibold tracking-tight text-ink" data-journey-status>
              {primaryCountry ? destinationHeadline(primaryCountry) : "Your journey begins once your country is confirmed"}
            </p>
            <p className="text-xs text-muted">
              {!primaryCountry
                ? "Your counsellor records the country you are going to, and each step of it appears here."
                : backups > 0
                  ? `${primaryCountry.name} is your primary country, with ${backups} backup${backups === 1 ? "" : "s"} running alongside — each has its own bar.`
                  : `Each step of your ${primaryCountry.name} process, kept up to date by your counsellor.`}
            </p>
          </div>
          {primaryCountry && primaryCountry.total > 0 && (
            <div className="text-right">
              <p className="text-4xl font-bold leading-none tracking-tight text-ink" data-journey-percent>
                {primaryCountry.percent}%
              </p>
              <p className="text-xs text-muted">
                {primaryCountry.done} of {primaryCountry.total} steps
              </p>
            </div>
          )}
        </div>
        {countries.length > 0 && (
          <div className="flex flex-col gap-4">
            {countries.map((row, i) => (
              <DestinationStatusCard key={row.destinationId} row={row} accent={countryAccent(i)} />
            ))}
          </div>
        )}
      </section>

      {/* The four figures a student checks most, each against its whole. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard icon={FolderOpen} title="Documents" subtitle={cycleDocs.showCycleTabs ? "This intake" : undefined} href="/portal/documents" linkLabel="Open">
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
          {toUpload.length > 0 && (
            <div className="mt-3 border-t border-border pt-2.5" data-dashboard-todo>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Still to upload</p>
              <ul className="flex flex-col gap-1">
                {toUpload.slice(0, 3).map((d) => (
                  <li key={d.id} className="min-w-0">
                    <Link
                      prefetch={false}
                      href={`/portal/documents?guide=${d.id}`}
                      className="flex min-w-0 items-center gap-1.5 text-xs text-ink hover:text-primary"
                      data-dashboard-todo-item={d.id}
                    >
                      <BookOpen aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{d.name}</span>
                      {d.sentBack && <span className="shrink-0 text-[11px] font-medium text-danger">sent back</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {toUpload.length > 3 && (
                <Link prefetch={false} href="/portal/documents" className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline">
                  and {toUpload.length - 3} more
                </Link>
              )}
            </div>
          )}
        </ChartCard>

        <ChartCard icon={CreditCard} title="Payments" href="/portal/payments" linkLabel="Open">
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

        <ChartCard icon={UserRound} title="Profile" href="/portal/profile" linkLabel="Open">
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

        <ChartCard icon={CalendarDays} title="Next appointment" href="/portal/appointments" linkLabel="All">
          <div data-kpi="appointment" className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
            {nextAppointment ? (
              <>
                <p className="text-5xl font-bold leading-none tracking-tight text-ink">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Everything outstanding — documents, money, appointments, replies —
            each computed by the helper its own page uses. */}
        <PortalAttention summary={summary} className="h-full" />
        <ChartCard
          icon={CalendarClock}
          title="Coming up"
          subtitle={timeline[0] ? `Next: ${timeline[0].label}, ${daysLeftLabel(timeline[0].daysLeft)}` : "Deadlines, payments and appointments"}
        >
          <UpcomingTimeline entries={timeline} />
        </ChartCard>
        <ChartCard
          icon={Landmark}
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

      {/* ---------------------------------------------------------- the team
          Both people who look after them, as the staff Dashboard shows them
          to a colleague: the counsellor who guides the plan, and the
          processing officer who files the applications and the visa. Either
          may not be assigned yet, and says so. */}
      <section className="flex flex-col gap-3" data-team>
        <div>
          <h3 className="text-base font-semibold text-ink">Your HMARK team</h3>
          <p className="text-xs text-muted">The people looking after you — call, email or message them any time.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TeamCard
            person={team.counsellor}
            role="Your counsellor"
            blurb="Guides your whole plan — universities, documents, your agreement and any question along the way."
            pending="A counsellor will be assigned to you shortly."
            marker="counsellor"
          />
          <TeamCard
            person={team.processingOfficer}
            role="Your processing officer"
            blurb="Files your applications and your visa, and keeps every deadline on track."
            pending="Your applications are handled by the HMARK processing team until an officer is named for you."
            marker="processing-officer"
          />
          <div className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 md:col-span-2 xl:col-span-1" data-lift>
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Other ways to reach us</p>
              <p className="mt-1 text-base font-semibold text-ink">We are one message away</p>
              <p className="mt-1 text-xs text-muted">
                Messages reach your counsellor in the office. For anything that needs looking into, raise a support ticket and we will
                keep you posted there.
              </p>
            </div>
            <div className="relative flex flex-wrap gap-2">
              <a href={WHATSAPP_LINK} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink shadow-sm transition-colors hover:bg-[var(--brand-strong)]">
                <MessageCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                WhatsApp HMARK
              </a>
              <Link prefetch={false} href="/portal/messages" className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary">
                <Mail aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Message
              </Link>
              <Link prefetch={false} href="/portal/support" className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary">
                <Headset aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
