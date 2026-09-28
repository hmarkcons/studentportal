import Link from "next/link";
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
    <div className="flex w-full flex-col gap-6">
      <Link href="/portal/applications" className="text-sm text-muted hover:text-ink">
        &larr; Back to applications
      </Link>

      <BoardingPassTracker
        universityName={university?.name ?? "University"}
        programName={program?.name}
        intake={app.intake}
        round={rounds.find((r) => r.id === app.round_id)?.label ?? null}
        currentStage={app.current_stage}
        pipelineStages={(destination as { pipeline_stages?: string[] } | null)?.pipeline_stages ?? []}
      />

      {/* Read-only. Since 0233 the application names the round it is for, so
          the student's own round is marked rather than left for them to guess
          — which also stops a closed earlier round reading as a deadline they
          personally missed. Where no round has been chosen yet the list is
          still the programme's rounds and says so, because naming one would
          assert something the data does not hold. */}
      <Card>
        <h3 className="mb-1 text-sm font-medium text-ink">Intake rounds</h3>
        {rounds.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-muted">
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

      <p className="text-xs text-muted" data-documents-pointer>
        Documents for this application are on your{" "}
        <Link href="/portal/documents" className="font-medium text-primary hover:underline">
          Documents
        </Link>{" "}
        page, with everything else we need from you.
      </p>
    </div>
  );
}
