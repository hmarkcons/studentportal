import { loadDocumentHistory } from "@/lib/documentHistory";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { PortalDocumentRow } from "./PortalDocumentRow";
import { ensureStudentDocumentRequirements } from "@/lib/actions/documents";
import { ProgramDates } from "@/components/ProgramDates";
import { karachiToday } from "@/lib/calendarDates";
import { sortRounds, type ProgramRound } from "@/lib/programRounds";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

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

  await ensureStudentDocumentRequirements(app.student_id);

  const { data: documents } = await supabase
    .from("student_documents")
    .select(
      "id, category, custom_name, status, file_path, deadline, rejected_reason, application_id, uploaded_at, uploaded_by_role, verified_at, created_at, template_id, template:document_templates(name)"
    )
    .eq("student_id", app.student_id)
    .or(`application_id.eq.${id},application_id.is.null`);

  const docHistory = await loadDocumentHistory(supabase, (documents ?? []).map((d) => d.id));

  const docsWithUrls = await Promise.all(
    (documents ?? []).map(async (d) => {
      const templateName = one(d.template as never) as { name?: string } | null;
      const baseName = d.custom_name ?? templateName?.name ?? d.category ?? "Document";
      const custom_name = d.application_id === null ? `${baseName} (shared — all applications)` : baseName;
      const past = docHistory.get(d.id) ?? [];
      if (!d.file_path) return { ...d, custom_name, history: past };
      const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
      return { ...d, custom_name, history: past, fileUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/portal" className="text-sm text-muted hover:text-ink">
        &larr; Back to dashboard
      </Link>

      <div className="mt-4 mb-6">
        <BoardingPassTracker
          universityName={university?.name ?? "University"}
          programName={program?.name}
          intake={app.intake}
          currentStage={app.current_stage}
          pipelineStages={(destination as { pipeline_stages?: string[] } | null)?.pipeline_stages ?? []}
        />
      </div>

      {/* Read-only. Since 0233 the application names the round it is for, so
          the student's own round is marked rather than left for them to guess
          — which also stops a closed earlier round reading as a deadline they
          personally missed. Where no round has been chosen yet the list is
          still the programme's rounds and says so, because naming one would
          assert something the data does not hold. */}
      {rounds.length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-1 text-sm font-medium text-ink">Intake rounds</h3>
          <p className="mb-2 text-xs text-muted">
            {app.round_id
              ? "When this programme starts, and the last date to apply. Your round is marked — your counsellor submits the application, so these dates are here for your information."
              : "When this programme starts, and the last date to apply for each round. Your counsellor will confirm which round your application goes in."}
          </p>
          <ProgramDates
            rounds={rounds}
            today={karachiToday()}
            showAll
            highlightRoundId={app.round_id}
            highlightLabel="your round"
          />
        </Card>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Documents</h3>
        {docsWithUrls.length === 0 ? (
          <p className="text-sm text-muted">Nothing to upload yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {docsWithUrls.map((doc) => (
              <PortalDocumentRow key={doc.id} doc={doc} studentId={app.student_id} revalidateTo={`/portal/applications/${id}`} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
