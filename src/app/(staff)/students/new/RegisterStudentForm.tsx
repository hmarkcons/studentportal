"use client";

import { useActionState, useState } from "react";
import { registerStudentManually } from "@/lib/actions/leads";
import { IntakeField, type IntakeConfig } from "@/components/IntakeField";
import { isIntakeMode } from "@/lib/intake";
import { STUDY_LEVELS, QUALIFICATION_LEVELS } from "@/lib/constants";
import { PrimaryBackupDestinationSelect } from "@/components/PrimaryBackupDestinationSelect";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { phoneBounds } from "@/lib/phoneNumber";

const labelClass = "text-sm font-medium text-ink";

export type DestinationOption = {
  id: string;
  display_name: string;
  intake_mode?: string | null;
  intake_seasons?: string[] | null;
};

/**
 * The intake shape for whichever country is currently primary.
 *
 * Null until one is chosen, which leaves a plain text box — the same thing
 * the field has always been, rather than an empty picker that cannot be used.
 */
export function intakeConfigFor(destinations: DestinationOption[], primaryId: string): IntakeConfig | null {
  const d = destinations.find((x) => x.id === primaryId);
  if (!d) return null;
  const mode = d.intake_mode ?? "free_text";
  return {
    destinationName: d.display_name,
    mode: isIntakeMode(mode) ? mode : "free_text",
    options: d.intake_seasons ?? [],
  };
}

export function RegisterStudentForm({
  counselors,
  destinations,
}: {
  counselors: { id: string; full_name: string }[];
  destinations: DestinationOption[];
}) {
  const [state, formAction, pending] = useActionState(registerStudentManually, undefined);
  const [primaryId, setPrimaryId] = useState("");
  const intakeConfig = intakeConfigFor(destinations, primaryId);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Name</label>
        <Input name="full_name" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Contact number</label>
          <Input name="contact_number" {...phoneBounds()} />
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
        <label className={labelClass}>Country of interest</label>
        <PrimaryBackupDestinationSelect destinations={destinations} onPrimaryChange={setPrimaryId} />
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
          <IntakeField config={intakeConfig} label="" />
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" variant="primary" pending={pending} className="mt-2">
        Register student
      </Button>
    </form>
  );
}
