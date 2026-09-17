"use client";

import { useActionState } from "react";
import { addProgram } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

export function AddProgramForm({ universityId }: { universityId: string }) {
  const action = addProgram.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="level" required>
        {STUDY_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>
      <Input name="name" placeholder="Program name" required className="min-w-[200px] flex-1" />
      <Input name="core_field" placeholder="Core field" />
      <Input name="sub_field" placeholder="Sub-field" />
      <Input name="tuition_fee" type="number" step="0.01" placeholder="Tuition fee" className="w-32" />
      {/* Labelled, because two bare date boxes side by side are guesswork —
          and these two are easy to enter the wrong way round. */}
      <label className="flex flex-col gap-0.5 text-[11px] text-muted">
        Course starts
        <Input name="start_date" type="date" />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-muted">
        Application deadline
        <Input name="application_deadline" type="date" />
      </label>
      <Button type="submit" variant="primary" pending={pending}>
        Add program
      </Button>
      <ActionStatus state={state} pending={pending} label="Programme added." />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
