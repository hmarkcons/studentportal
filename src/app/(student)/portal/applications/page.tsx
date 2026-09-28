import Link from "next/link";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { ProgramDates } from "@/components/ProgramDates";
import { karachiToday } from "@/lib/calendarDates";
import { loadStudentApplications } from "@/lib/studentApplications";
import { applicationAdmitted, applicationSubmitted } from "@/lib/studentJourney";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalStat, PortalStats } from "@/components/studentPortal/PortalStat";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";

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
  // Karachi's business day decides which rounds have closed.
  const today = karachiToday();
  const { submitted, offers } = summarise(apps);
  const finalised = apps.filter(({ app }) => app.is_finalized).length;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon="🏛️"
        title="Applications"
        description="Every university you are applying to, how far each application has got, and when its round closes. Your counsellor submits them and keeps this up to date."
      >
        {apps.length > 0 && (
          <PortalStats data-applications-summary>
            <PortalStat icon="🏛️" value={apps.length} label={`application${apps.length === 1 ? "" : "s"}`} />
            <PortalStat icon="📨" value={submitted} label="submitted" tone="info" />
            <PortalStat icon="🎉" value={offers} label={`offer${offers === 1 ? "" : "s"}`} tone={offers > 0 ? "success" : "default"} />
            <PortalStat icon="🛂" value={finalised} label="finalised for your visa" tone={finalised > 0 ? "success" : "default"} />
          </PortalStats>
        )}
      </PortalPageHeader>

      {apps.length === 0 ? (
        <Card>
          <PortalEmpty icon="🏛️" title="No applications yet">
            Your counsellor adds each university here once your documents are ready — you will see it move through every stage.
          </PortalEmpty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2" data-applications>
          {apps.map(({ app, uni, dest, program }) => {
            // The round's own label, so two applications to one programme in
            // different rounds do not read as the same card twice.
            const roundLabel = (program?.rounds ?? []).find((r) => r.id === app.round_id)?.label ?? null;
            return (
              <div key={app.id} className="flex flex-col gap-1.5" data-rise>
                <Link href={`/portal/applications/${app.id}`} className="block rounded-2xl">
                  <BoardingPassTracker
                    tone="pass"
                    universityName={uni?.name ?? "University"}
                    programName={program?.name}
                    intake={app.intake}
                    round={roundLabel}
                    currentStage={app.current_stage ?? ""}
                    pipelineStages={dest?.pipeline_stages ?? []}
                  />
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-2 px-2">
                  <ProgramDates rounds={program?.rounds ?? []} today={today} highlightRoundId={app.round_id} />
                  <Link href={`/portal/applications/${app.id}`} className="text-xs font-medium text-primary hover:underline">
                    Intake rounds →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
