"use client";

import { useActionState, useState } from "react";
import { updateApplicationDetails } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { IntakeField, type IntakeConfig } from "@/components/IntakeField";
import { roundOptionLabel, sortRounds, type ProgramRound } from "@/lib/programRounds";

export function ApplicationDetailsForm({
  applicationId,
  studentId,
  deadline,
  application_fee,
  special_requirements,
  intake,
  intakeConfig,
  programId,
  roundId,
  programs,
  roundsTakenElsewhere = {},
  isFinalized,
  universityName,
  today,
}: {
  applicationId: string;
  studentId: string;
  deadline: string | null;
  application_fee: number | null;
  special_requirements: string | null;
  intake: string | null;
  /** This application's own destination decides the shape of the field. */
  intakeConfig: IntakeConfig | null;
  programId: string | null;
  /** Which of the programme's intake rounds this application is for. */
  roundId: string | null;
  /** Every programme at this application's university, with its intake rounds. */
  programs: { id: string; name: string; rounds?: ProgramRound[] }[];
  /**
   * Rounds this student's OTHER applications already occupy, by programme.
   * One application per programme per round (0234), so offering one of these
   * would fail on save — they are left out rather than discovered.
   */
  roundsTakenElsewhere?: Record<string, string[]>;
  /** Finalised for the visa: the programme is what the visa record describes. */
  isFinalized: boolean;
  universityName: string;
  /** Karachi's today, so a closed round is labelled on the business day. */
  today?: string;
}) {
  const action = updateApplicationDetails.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  // Controlled, because the round list has to follow the programme as it is
  // changed rather than after a save. Changing the programme clears the round:
  // a round belongs to one programme, and the server refuses a pair that does
  // not match.
  const [selectedProgramId, setSelectedProgramId] = useState(programId ?? "");
  const [selectedRoundId, setSelectedRoundId] = useState(roundId ?? "");
  // The round currently saved on this application stays offered even if it
  // appears in the taken list — otherwise the field would silently drop the
  // application's own round and saving would clear it.
  const taken = new Set((roundsTakenElsewhere[selectedProgramId] ?? []).filter((rid) => rid !== roundId));
  const rounds = sortRounds(programs.find((p) => p.id === selectedProgramId)?.rounds ?? []).filter(
    (r) => !r.id || !taken.has(r.id)
  );

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* The programme and the intake were not editable at all: a mis-keyed
          programme could only be fixed by deleting the application and making
          a new one, which takes its tasks, documents, interviews and stage
          history with it. */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Programme
        {isFinalized ? (
          <>
            <Input value={programs.find((p) => p.id === programId)?.name ?? "Not set"} disabled readOnly />
            <span className="text-xs text-muted">
              Fixed while this application is finalised for the visa — un-finalise it first if the programme has really
              changed.
            </span>
          </>
        ) : (
          <>
            <Select
              name="program_id"
              value={selectedProgramId}
              onChange={(e) => {
                setSelectedProgramId(e.target.value);
                setSelectedRoundId("");
              }}
            >
              <option value="">No programme chosen yet</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">Programmes at {universityName}.</span>
          </>
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Intake round
        {rounds.length === 0 ? (
          <>
            {/* Still submitted, so clearing the programme clears the round
                rather than leaving it pointing at the old one. */}
            <input type="hidden" name="round_id" value="" />
            <Input value="No rounds set for this programme" disabled readOnly />
            <span className="text-xs text-muted">
              Add rounds under Setup › {universityName} to choose one here.
            </span>
          </>
        ) : (
          <>
            <Select name="round_id" value={selectedRoundId} onChange={(e) => setSelectedRoundId(e.target.value)}>
              <option value="">No specific round yet</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id ?? ""}>
                  {roundOptionLabel(r, today)}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">
              Sets which round&apos;s closing date the reminders and calendar use, unless a Deadline is typed below.
            </span>
          </>
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Intake
        <IntakeField config={intakeConfig} defaultValue={intake} label="" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline
        <Input name="deadline" type="date" defaultValue={deadline ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application fee
        <Input name="application_fee" type="number" step="0.01" min="0" defaultValue={application_fee ?? ""} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Special requirements
        <Textarea name="special_requirements" defaultValue={special_requirements ?? ""} rows={2} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-1 text-xs text-danger">{state.error}</p>}
        <Button type="submit" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
      </div>
    </form>
  );
}
