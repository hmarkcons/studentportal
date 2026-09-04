"use client";

import { useActionState } from "react";
import { registerStudentManually } from "@/lib/actions/leads";
import { STUDY_LEVELS, QUALIFICATION_LEVELS } from "@/lib/constants";
import { DestinationMultiSelect } from "@/components/DestinationMultiSelect";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const labelClass = "text-sm font-medium text-ink";

export function RegisterStudentForm({
  counselors,
  destinations,
}: {
  counselors: { id: string; full_name: string }[];
  destinations: { id: string; display_name: string }[];
}) {
  const [state, formAction, pending] = useActionState(registerStudentManually, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Name</label>
        <Input name="full_name" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Contact number</label>
          <Input name="contact_number" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Email</label>
          <Input name="email" type="email" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Current qualification</label>
          <Select name="current_qualification">
            <option value="">—</option>
            {QUALIFICATION_LEVELS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Applying for</label>
          <Select name="level_applying_for">
            <option value="">—</option>
            {STUDY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Course of interest</label>
        <Input name="course_of_interest" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Countries of interest</label>
        <DestinationMultiSelect destinations={destinations} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Assigned counselor</label>
          <Select name="assigned_counselor_id">
            <option value="">Unassigned</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Intake</label>
          <Input name="intake" placeholder="e.g. Fall 2026" />
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" variant="primary" pending={pending} className="mt-2">
        Register student
      </Button>
    </form>
  );
}
