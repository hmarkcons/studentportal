"use client";

import { useActionState, useMemo, useState } from "react";
import { createApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { IntakeField } from "@/components/IntakeField";
import { intakeConfigFor, type DestinationOption } from "@/app/(staff)/students/new/RegisterStudentForm";
import { ActionStatus } from "@/components/ActionStatus";
import { ProgramDates } from "@/components/ProgramDates";
import { roundOptionLabel, sortRounds, type ProgramRound } from "@/lib/programRounds";

type Destination = DestinationOption;
type University = { id: string; name: string; destination_id: string };
type Program = {
  id: string;
  university_id: string;
  name: string;
  rounds: ProgramRound[];
};

export function NewApplicationForm({
  studentId,
  destinations,
  universities,
  programs,
  today,
}: {
  studentId: string;
  destinations: Destination[];
  universities: University[];
  programs: Program[];
  /** Karachi's today, so "applications closed" is judged on the business day. */
  today?: string;
}) {
  const action = createApplication.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [destinationId, setDestinationId] = useState("");
  const [universityId, setUniversityId] = useState("");
  // One slot per programme being applied for, each carrying its own intake
  // round. Kept as one array of pairs rather than two parallel arrays, so a
  // programme and its round cannot drift out of step.
  const [slots, setSlots] = useState<{ programId: string; roundId: string }[]>([{ programId: "", roundId: "" }]);

  // Changing the university invalidates every programme already chosen. This
  // used to leave them in state: the <Select> showed blank because the old id
  // matched none of the new options, but the id was still there and was still
  // submitted, filing an application against a programme from the university
  // the user had just navigated away from.
  function chooseUniversity(id: string) {
    setUniversityId(id);
    setSlots([{ programId: "", roundId: "" }]);
  }

  const filteredUniversities = useMemo(
    () => universities.filter((u) => !destinationId || u.destination_id === destinationId),
    [universities, destinationId]
  );
  const filteredPrograms = useMemo(() => programs.filter((p) => p.university_id === universityId), [programs, universityId]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Country</label>
        {/* The visible <label> above is not associated with this select — it
            has no htmlFor and the select has no id — and the select carries no
            name either, since the destination only drives the filtering. So it
            announced as an unlabelled combobox. */}
        <Select
          aria-label="Country"
          required
          value={destinationId}
          onChange={(e) => {
            setDestinationId(e.target.value);
            chooseUniversity("");
          }}
        >
          <option value="">Choose…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        {destinations.length === 0 && (
          <p className="text-xs text-danger">This student isn&apos;t registered for any destination yet.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">University</label>
        <Select
          aria-label="University"
          name="university_id"
          required
          value={universityId}
          onChange={(e) => chooseUniversity(e.target.value)}
        >
          <option value="">Choose…</option>
          {filteredUniversities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink">Programs</label>
        {slots.map((slot, i) => {
          const chosen = programs.find((p) => p.id === slot.programId) ?? null;
          const rounds = sortRounds(chosen?.rounds ?? []);
          return (
            <div key={i} className="flex flex-col gap-0.5">
              {/* The values are submitted as hidden inputs, not by naming the
                  selects. A controlled <select> whose value matches none of
                  its options submits nothing at all, which would shorten one
                  of the two lists and pair a round with the wrong programme —
                  the lists are read back by index. */}
              <input type="hidden" name="program_ids" value={slot.programId} />
              <input type="hidden" name="round_ids" value={slot.roundId} />
              {/* One "Programs" label sits above every slot, so each control
                  names itself — otherwise a screen reader reads four selects
                  all called "Programs". */}
              <Select
                aria-label={`Programme ${i + 1}`}
                value={slot.programId}
                onChange={(e) =>
                  setSlots((prev) =>
                    // The round is cleared with the programme: a round belongs
                    // to one programme, so keeping it would point at another.
                    prev.map((s, idx) => (idx === i ? { programId: e.target.value, roundId: "" } : s))
                  )
                }
              >
                <option value="">Program {i + 1}…</option>
                {filteredPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {rounds.length > 0 && (
                <Select
                  aria-label={`Intake round for programme ${i + 1}`}
                  value={slot.roundId}
                  onChange={(e) =>
                    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, roundId: e.target.value } : s)))
                  }
                  className="text-xs"
                >
                  {/* Optional: staff often add the application before the round
                      is settled, and forcing a guess would put a wrong date
                      into the reminder cron. */}
                  <option value="">No specific round yet</option>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id ?? ""}>
                      {roundOptionLabel(r, today)}
                    </option>
                  ))}
                </Select>
              )}
              {/* The catalogue's own dates for whatever was just picked, so
                  the Deadline box below is filled in knowing them rather than
                  from memory. Every round is listed, not just the open one —
                  a closed Round 1 above an open Round 2 is exactly what the
                  person needs to see. Renders nothing where the programme has
                  no dates at all. */}
              {chosen && <ProgramDates rounds={chosen.rounds} today={today} showAll className="pl-1" />}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setSlots((prev) => [...prev, { programId: "", roundId: "" }])}
          className="self-start text-xs font-medium text-primary hover:underline"
        >
          + Add another program
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Intake</label>
          {/* The application already knows its destination, so the intake
              field is exactly the one that country uses. */}
          <IntakeField config={intakeConfigFor(destinations, destinationId)} label="" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">Deadline</label>
          <Input name="deadline" type="date" />
        </div>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending}>
        Create application
      </Button>
      <ActionStatus state={state} pending={pending} label="Application added." />
    </form>
  );
}
