import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MessageThread, type MessageRow } from "@/components/MessageThread";
import { ReferralTrendChart } from "@/components/ReferralTrendChart";
import { formatDateOnly } from "@/lib/formatDate";
import { ROUND_DATE_FORMAT } from "@/lib/programRounds";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { karachiToday } from "@/lib/calendarDates";
import { summarizePartner } from "@/lib/dashboards/partner";
import { formatAmount } from "@/lib/marketing";

type PartnerApplicationRow = {
  application_id: string;
  student_name: string;
  program_name: string | null;
  intake: string | null;
  current_stage: string;
  /** The destination's stage list, which is what says whether a stage is before or after the decision. */
  pipeline_stages: string[] | null;
  submitted_at: string;
  /**
   * The effective deadline, as 0235 computes it: the date HMARK typed for this
   * student, else the chosen intake round's, else the programme's catalogue
   * date. It used to be the programme's alone, which is a mirror of the FIRST
   * round — so an application working to a later round showed a date that had
   * already passed and then vanished from the list below, which filters to
   * dates still ahead.
   */
  application_deadline: string | null;
  /** Which intake round, where one is chosen. Two applications for one programme differ only by this. */
  round_label: string | null;
  student_email: string | null;
  student_phone: string | null;
  // An array since 0154 — see the detail page for why the category→status map
  // had to go. Declared for the RPC's shape; this page does not render it.
  documents_summary: { name: string; status: string }[] | null;
};

// Approximates the year an application reached 'enrolled', since
// application_stage_history isn't exposed to partner accounts — the intake
// term (e.g. "Fall 2027") is a much closer proxy for enrollment year than
// when the application was submitted, since a student can be referred well
// before the intake they're actually enrolling for. Good enough for a
// year-over-year shape; not a precise enrollment date. Only ever used for
// enrolled rows — referrals themselves are always bucketed by the real
// submission date (see trendData below), never by intake.
function enrolledYearApprox(row: PartnerApplicationRow): number {
  const fromIntake = row.intake?.match(/\d{4}/)?.[0];
  return fromIntake ? Number(fromIntake) : new Date(row.submitted_at).getFullYear();
}

export default async function PartnerDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("partner_university_accounts")
    .select("university_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: applicationsData } = await supabase.rpc("get_partner_applications");
  const applications = (applicationsData ?? []) as PartnerApplicationRow[];

  const pending = applications.filter((a) => !["enrolled", "rejected", "declined", "withdrawn"].includes(a.current_stage));
  const enrolled = applications.filter((a) => a.current_stage === "enrolled");
  const rejected = applications.filter((a) => ["rejected", "declined"].includes(a.current_stage));
  const decided = enrolled.length + rejected.length;
  const acceptanceRate = decided > 0 ? Math.round((enrolled.length / decided) * 100) : null;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingDeadlines = applications
    .filter((a) => a.application_deadline && a.application_deadline >= today)
    .sort((a, b) => (a.application_deadline! < b.application_deadline! ? -1 : 1))
    .slice(0, 10);

  // A referral counts toward the year it actually happened (submitted_at),
  // never the intake year it's targeting — those two years legitimately
  // differ whenever a student is referred ahead of a future intake, which is
  // routine. Enrollment year is a separate, independent approximation (see
  // enrolledYearApprox) and can land in a different bucket than the same
  // application's own referral year.
  const trendMap = new Map<number, { referred: number; enrolled: number }>();
  applications.forEach((a) => {
    const referredYear = new Date(a.submitted_at).getFullYear();
    const referredEntry = trendMap.get(referredYear) ?? { referred: 0, enrolled: 0 };
    referredEntry.referred += 1;
    trendMap.set(referredYear, referredEntry);

    if (a.current_stage === "enrolled") {
      const enrolledYear = enrolledYearApprox(a);
      const enrolledEntry = trendMap.get(enrolledYear) ?? { referred: 0, enrolled: 0 };
      enrolledEntry.enrolled += 1;
      trendMap.set(enrolledYear, enrolledEntry);
    }
  });
  const trendData = [...trendMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, ...v }));

  const { data: commissionsRaw } = account
    ? await supabase
        .from("partner_commissions")
        .select("id, expected_amount, currency, status, student:leads(full_name), application:applications(intake)")
    : { data: [] };

  const summary = summarizePartner({
    apps: applications.map((a) => ({ ...a, pipeline_stages: Array.isArray(a.pipeline_stages) ? a.pipeline_stages : [] })),
    commissions: (commissionsRaw ?? []) as { status: string | null; expected_amount: number | string | null; currency: string | null }[],
    today: karachiToday(),
  });
  const OUTCOME_COLORS: Record<string, string> = {
    pending: "var(--chart-6)",
    submitted: "var(--chart-2)",
    with_offer: "var(--success)",
    rejected: "var(--danger)",
    not_eligible: "var(--chart-5)",
    withdrawn: "var(--chart-3)",
  };

  function one<T>(v: T | T[] | null) {
    return Array.isArray(v) ? v[0] ?? null : v;
  }

  const { data: messagesData } = account
    ? await supabase
        .from("messages")
        .select("id, body, channel, direction, sent_at, sent_by:staff(full_name)")
        .eq("entity_type", "university")
        .eq("entity_id", account.university_id)
        .order("sent_at", { ascending: false })
        .limit(5)
        .returns<MessageRow[]>()
    : { data: [] };

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-6 text-lg font-semibold text-ink">Partner Dashboard</h2>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-partner-dashboard>
        <StatCard label="Referred by HMARK" value={applications.length} hint="all time" />
        <StatCard
          label="Awaiting your decision"
          value={summary.awaitingCount}
          tone={summary.awaitingCount ? "warning" : "default"}
          hint={summary.awaitingDecision[0] ? `longest waiting ${summary.awaitingDecision[0].days} days` : undefined}
        />
        <StatCard label="Enrolled via HMARK" value={enrolled.length} tone="success" hint={`${summary.offers} offers made`} />
        <StatCard
          label="Offer rate"
          value={summary.offerRate === null ? "—" : `${summary.offerRate}%`}
          hint={acceptanceRate === null ? "of applications decided" : `${acceptanceRate}% of decided students enrolled`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="From referral to enrolment" subtitle="Every student HMARK has referred to you">
          <FunnelChart label="Students referred, submitted, offered a place and enrolled" stages={summary.funnel} />
        </ChartCard>
        <ChartCard title="Where applications stand" subtitle="By outcome">
          <DonutChart
            label="Applications by outcome"
            centerLabel="applications"
            slices={summary.outcomes.map((o) => ({ label: o.label, value: o.count, color: OUTCOME_COLORS[o.key] }))}
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Commission" subtitle="Received against expected" href="/partner/commissions" linkLabel="Commissions">
          <div className="flex justify-center py-2">
            <ProgressRing
              value={summary.commissions.received}
              target={summary.commissions.total || null}
              label="Received"
              caption={
                summary.commissions.byCurrency.length
                  ? summary.commissions.byCurrency.map((c) => `${formatAmount(c.received, c.currency)} of ${formatAmount(c.expected, c.currency)}`).join(" · ")
                  : "no commission records yet"
              }
              tone={summary.commissions.overdue ? "warning" : undefined}
            />
          </div>
        </ChartCard>
        <ChartCard title="Waiting on your decision" subtitle="Submitted, longest waiting first" className="lg:col-span-2">
          {summary.awaitingDecision.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nothing is waiting on a decision.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {summary.awaitingDecision.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                  <Link href={`/partner/applications/${a.id}`} className="min-w-0 truncate text-primary hover:underline">
                    {a.label}
                  </Link>
                  <span className={`shrink-0 text-xs tabular-nums ${a.days >= 14 ? "text-danger" : "text-muted"}`}>{a.days} days</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Students referred & enrolled, by year</h3>
        <ReferralTrendChart data={trendData} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Applications pending review</h3>
        <div className="flex flex-col divide-y divide-border">
          {pending.map((a) => (
            <Link key={a.application_id} href={`/partner/applications/${a.application_id}`} className="flex items-center justify-between py-2 text-sm hover:text-primary">
              <span>
                {a.student_name} {a.program_name && `· ${a.program_name}`} {a.intake && `· ${a.intake}`}
              </span>
              <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
            </Link>
          ))}
          {pending.length === 0 && <p className="py-2 text-sm text-muted">Nothing pending review.</p>}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Students enrolled via HMARK</h3>
        <div className="flex flex-col divide-y divide-border">
          {enrolled.map((a) => (
            <div key={a.application_id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {a.student_name} {a.program_name && `· ${a.program_name}`}
              </span>
              <span className="text-muted">{a.intake ?? "—"}</span>
            </div>
          ))}
          {enrolled.length === 0 && <p className="py-2 text-sm text-muted">No enrollments yet.</p>}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Commission summary</h3>
        <div className="flex flex-col divide-y divide-border">
          {(commissionsRaw ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {one(c.student)?.full_name} {one(c.application)?.intake && `· ${one(c.application)?.intake}`}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted tabular-nums">
                  {c.currency} {c.expected_amount ?? "—"}
                </span>
                <Badge tone={c.status === "received" ? "success" : c.status === "disputed" ? "danger" : "warning"}>{c.status.replace(/_/g, " ")}</Badge>
              </span>
            </div>
          ))}
          {(!commissionsRaw || commissionsRaw.length === 0) && <p className="py-2 text-sm text-muted">No commission records yet.</p>}
        </div>
        <Link href="/partner/commissions" className="mt-3 inline-block text-sm text-primary hover:underline">
          Manage commissions →
        </Link>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Upcoming intake deadlines</h3>
        <div className="flex flex-col divide-y divide-border">
          {upcomingDeadlines.map((a) => (
            <div key={a.application_id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {a.student_name} {a.program_name && `· ${a.program_name}`}
                {/* Two applications for one programme differ only by the
                    round, and each round has its own closing date — without
                    this the two rows read as a duplicate with two dates. */}
                {a.round_label && <span className="text-muted"> · {a.round_label}</span>}
              </span>
              {/* formatDateOnly rather than toLocaleDateString: a date-only
                  value parses as UTC midnight but renders in the local zone,
                  showing the previous day to any viewer behind UTC, and the
                  server and browser disagree about locale, which React reports
                  as a hydration mismatch and recovers from by throwing away
                  the server's HTML. */}
              <span className="text-muted">{formatDateOnly(a.application_deadline!, ROUND_DATE_FORMAT)}</span>
            </div>
          ))}
          {upcomingDeadlines.length === 0 && <p className="py-2 text-sm text-muted">No upcoming deadlines on file.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Recent messages</h3>
        <MessageThread
          messages={(messagesData ?? []).slice().reverse()}
          entityType="university"
          entityId={account?.university_id ?? ""}
          channel="inapp"
          revalidateTo="/partner"
        />
      </Card>
    </div>
  );
}
