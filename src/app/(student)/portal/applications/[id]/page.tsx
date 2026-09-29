import Link from "next/link";
import { ArrowLeft, CalendarRange, FolderOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { ProgramDates } from "@/components/ProgramDates";
import { karachiToday } from "@/lib/calendarDates";
import { sortRounds, type ProgramRound } from "@/lib/programRounds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * One application: where it stands, and its intake rounds.
 *
 * Its documents are not repeated here. They live on the Documents page, the
 * application's own ones labelled with its university, so a student has one
 * checklist to work through rather than the same passport in two places.
 */
export default async function PortalApplicationPage(props: PageProps<"/portal/applications/[id]">) {
  const { id } = await props.params;
  const { supabase, userId } = await getStudentUser();

  const { data: app, error } = await supabase
    .from("applications")
    .select(
      "id, student_id, current_stage, intake, round_id, university:universities(name, destination:destinations(pipeline_stages)), program:programs(name, rounds:program_intake_rounds(id, label, start_date, application_deadline, sort_order)), student:leads!inner(auth_user_id)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !app || one(app.student)?.auth_user_id !== userId) notFound();

  const university = one(app.university);
  const destination = university ? one(university.destination as never) : null;
  const program = one(app.program) as { name?: string; rounds?: ProgramRound[] } | null;
  const rounds = sortRounds(program?.rounds ?? []);

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <Link
        href="/portal/applications"
        data-rise
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted shadow-sm hover:border-primary hover:text-primary"
      >
        <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />
        Back to applications
      </Link>

      <div data-rise>
        <BoardingPassTracker
          tone="pass"
          universityName={university?.name ?? "University"}
          programName={program?.name}
          intake={app.intake}
          round={rounds.find((r) => r.id === app.round_id)?.label ?? null}
          currentStage={app.current_stage}
          pipelineStages={(destination as { pipeline_stages?: string[] } | null)?.pipeline_stages ?? []}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        {/* Read-only. Since 0233 the application names the round it is for, so
            the student's own round is marked rather than left for them to guess
            — which also stops a closed earlier round reading as a deadline they
            personally missed. Where no round has been chosen yet the list is
            still the programme's rounds and says so, because naming one would
            assert something the data does not hold. */}
        <Card className="lg:col-span-2">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <CalendarRange aria-hidden className="h-5 w-5 text-primary shrink-0" /> Intake rounds
          </h3>
          {rounds.length > 0 ? (
            <>
              <p className="mb-3 text-xs text-muted">
                {app.round_id
                  ? "When this programme starts, and the last date to apply. Your round is marked — your counsellor submits the application, so these dates are here for your information."
                  : "When this programme starts, and the last date to apply for each round. Your counsellor will confirm which round your application goes in."}
              </p>
              <ProgramDates rounds={rounds} today={karachiToday()} showAll highlightRoundId={app.round_id} highlightLabel="your round" />
            </>
          ) : (
            <p className="text-sm text-muted">No intake rounds are recorded for this programme yet — your counsellor will confirm the dates.</p>
          )}
        </Card>

        <Card>
          <div className="flex flex-col gap-3" data-documents-pointer>
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderOpen className="h-5 w-5" />
            </span>
            <p className="text-sm text-ink">
              Documents for this application are on your{" "}
              <Link href="/portal/documents" className="font-medium text-primary hover:underline">
                Documents
              </Link>{" "}
              page, with everything else we need from you.
            </p>
            <p className="text-xs text-muted">One checklist for everything, so the same passport is never asked for twice.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
