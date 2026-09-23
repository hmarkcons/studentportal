"use client";

import { useActionState, useState } from "react";
import { partnerAddProgram } from "@/lib/actions/partner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";

const STUDY_LEVELS = ["bachelors", "masters", "phd"];

export function AddProgramForm() {
  const [state, formAction, pending] = useActionState(partnerAddProgram, undefined);

  // See the staff form: the rounds widget keeps its rows in state, so it has
  // to be remounted to clear after a programme is added, and the remount is
  // triggered during render rather than from an effect.
  const [handledState, setHandledState] = useState(state);
  const [roundsKey, setRoundsKey] = useState(0);
  if (handledState !== state) {
    setHandledState(state);
    if (state?.success) setRoundsKey((k) => k + 1);
  }

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
      <Input name="duration" placeholder="Duration" className="w-28" />
      <Input name="tuition_fee" type="number" step="0.01" placeholder="Tuition fee" className="w-32" />
      <Input name="language_requirement" placeholder="Language requirement" />
      <ProgramRoundsFields key={roundsKey} />
      <Button type="submit" pending={pending} variant="primary" status={{ state, label: "Programme added." }}>
        Add program
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
