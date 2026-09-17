"use client";

import { useActionState, useEffect, useState } from "react";
import { addProgram } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";

export function AddProgramForm({ universityId }: { universityId: string }) {
  const action = addProgram.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  // The rounds widget holds its rows in state, so React's form reset does not
  // clear them the way it clears the plain inputs. On this form that would
  // carry the programme just added over to the next one — remounting it on
  // success empties it to match the rest of the form.
  const [roundsKey, setRoundsKey] = useState(0);
  useEffect(() => {
    if (state?.success) setRoundsKey((k) => k + 1);
  }, [state]);

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
      {/* Labelled, because bare date boxes side by side are guesswork — and a
          course start and an apply-by date are easy to enter the wrong way
          round. */}
      <ProgramRoundsFields key={roundsKey} />
      <Button type="submit" variant="primary" pending={pending}>
        Add program
      </Button>
      <ActionStatus state={state} pending={pending} label="Programme added." />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
