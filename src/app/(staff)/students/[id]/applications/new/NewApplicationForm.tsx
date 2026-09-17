"use client";

import { useActionState, useMemo, useState } from "react";
import { createApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { IntakeField } from "@/components/IntakeField";
import { intakeConfigFor, type DestinationOption } from "@/app/(staff)/students/new/RegisterStudentForm";
import { ActionStatus } from "@/components/ActionStatus";
import { ProgramDates } from "@/components/ProgramDates";
import type { ProgramRound } from "@/lib/programRounds";

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
  const [programSlots, setProgramSlots] = useState<string[]>([""]);

  const filteredUniversities = useMemo(
    () => universities.filter((u) => !destinationId || u.destination_id === destinationId),
    [universities, destinationId]
  );
  const filteredPrograms = useMemo(() => programs.filter((p) => p.university_id === universityId), [programs, universityId]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Country</label>
        <Select
          required
          value={destinationId}
          onChange={(e) => {
            setDestinationId(e.target.value);
            setUniversityId("");
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
          name="university_id"
          required
          value={universityId}
          onChange={(e) => setUniversityId(e.target.value)}
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
        {programSlots.map((value, i) => {
          const chosen = programs.find((p) => p.id === value) ?? null;
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <Select
                name="program_ids"
                value={value}
                onChange={(e) =>
                  setProgramSlots((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                }
              >
                <option value="">Program {i + 1}…</option>
                {filteredPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {/* The catalogue's own dates for whatever was just picked, so
                  the Deadline box below is filled in knowing them rather than
                  from memory. Every round is listed, not just the open one —
                  the deadline being typed here is for a particular round, and
                  a closed Round 1 above an open Round 2 is exactly what the
                  person needs to see. Renders nothing where the programme has
                  no dates at all. */}
              {chosen && <ProgramDates rounds={chosen.rounds} today={today} showAll className="pl-1" />}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setProgramSlots((prev) => [...prev, ""])}
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
