"use client";

import { useActionState } from "react";
import { partnerAddProgram } from "@/lib/actions/partner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const STUDY_LEVELS = ["bachelors", "masters", "phd"];

export function AddProgramForm() {
  const [state, formAction, pending] = useActionState(partnerAddProgram, undefined);

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
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application deadline
        <Input name="application_deadline" type="date" />
      </label>
      <Button type="submit" disabled={pending} variant="primary">
        {pending ? "Adding…" : "Add program"}
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
