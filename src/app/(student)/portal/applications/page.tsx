import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { DestinationPipelineCard } from "@/components/DestinationPipelineCard";
import { ProgramDates } from "@/components/ProgramDates";
import { karachiToday } from "@/lib/calendarDates";
import { loadStudentApplications, destinationProgressRows } from "@/lib/studentApplications";
import { applicationAdmitted, applicationSubmitted } from "@/lib/studentJourney";

/** The same tests the dashboard journey's Applied and Admission steps use. */
function summarise(apps: Awaited<ReturnType<typeof loadStudentApplications>>) {
  const asJourney = apps.map(({ app, uni, dest }) => ({
    stage: app.current_stage,
    stages: dest?.pipeline_stages ?? [],
    finalized: Boolean(app.is_finalized),
    university: uni?.name ?? "",
  }));
  return { submitted: asJourney.filter(applicationSubmitted).length, offers: asJourney.filter(applicationAdmitted).length };
}

export default async function PortalApplicationsPage() {
  const { supabase, userId } = await getStudentUser();
  const { data: student } = await supabase.from("students").select("id").eq("auth_user_id", userId ?? "").maybeSingle();
  if (!student) return null;

  const apps = await loadStudentApplications(supabase, student.id);
  const progress = await destinationProgressRows(supabase, student.id, apps);
  // Karachi's business day decides which rounds have closed.
  const today = karachiToday();
  const { submitted, offers } = summarise(apps);

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-ink">Applications</h2>
        <p className="text-sm text-muted">
          Every university you are applying to, how far each application has got, and when its round closes. Your
          counsellor submits them and keeps this up to date.
        </p>
      </div>

      {apps.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs" data-applications-summary>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-ink">
            {apps.length} application{apps.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-ink">{submitted} submitted</span>
          <span className={`rounded-full border px-3 py-1 ${offers > 0 ? "border-success bg-success-bg text-success" : "border-border bg-card text-ink"}`}>
            {offers} offer{offers === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* The cards beside their countries' progress on a wide screen: two
          columns that each fill, rather than two half-empty rows. */}
      <div className={progress.length > 0 ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-2" : ""}>
      <section className="flex flex-col gap-3">
      {progress.length > 0 && <h3 className="text-sm font-semibold text-ink">Your applications</h3>}
      {apps.length === 0 ? (
        <Card>
          <EmptyState>
            No applications yet. Your counsellor adds each university here once your documents are ready — you will see it
            move through every stage.
          </EmptyState>
        </Card>
      ) : (
        <div className={`grid grid-cols-1 items-start gap-4 ${progress.length > 0 ? "" : "xl:grid-cols-2"}`} data-applications>
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
                    currentStage={app.current_stage ?? ""}
                    pipelineStages={dest?.pipeline_stages ?? []}
                  />
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <ProgramDates rounds={program?.rounds ?? []} today={today} highlightRoundId={app.round_id} />
                  <Link href={`/portal/applications/${app.id}`} className="text-xs font-medium text-primary hover:underline">
                    Documents &amp; rounds →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </section>

      {progress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Progress by country</h3>
          <div className="grid grid-cols-1 items-start gap-4">
            {progress.map((row) => (
              <DestinationPipelineCard
                key={row.destinationId}
                leadId={student.id}
                destinationId={row.destinationId}
                destinationName={row.destinationName}
                subtitle={row.applicationSummary}
                stages={row.stages}
                values={row.values}
                editable={false}
                revalidateTo="/portal/applications"
              />
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
