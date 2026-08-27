"use client";

import { useActionState, useMemo, useState } from "react";
import { createApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Destination = { id: string; display_name: string };
type University = { id: string; name: string; destination_id: string };
type Program = { id: string; university_id: string; name: string };

export function NewApplicationForm({
  studentId,
  destinations,
  universities,
  programs,
}: {
  studentId: string;
  destinations: Destination[];
  universities: University[];
  programs: Program[];
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
        {programSlots.map((value, i) => (
          <Select
            key={i}
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
        ))}
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
          <Input name="intake" placeholder="e.g. Fall 2026" />
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
    </form>
  );
}
