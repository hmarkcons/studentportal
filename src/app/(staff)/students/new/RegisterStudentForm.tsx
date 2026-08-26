"use client";

import { useActionState } from "react";
import { registerStudentManually } from "@/lib/actions/leads";
import { STUDY_LEVELS } from "@/lib/constants";
import { DestinationMultiSelect } from "@/components/DestinationMultiSelect";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";
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
        <input name="full_name" required className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Contact number</label>
          <input name="contact_number" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Email</label>
          <input name="email" type="email" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Current qualification</label>
          <input name="current_qualification" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Applying for</label>
          <select name="level_applying_for" className={inputClass}>
            <option value="">—</option>
            {STUDY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Course of interest</label>
        <input name="course_of_interest" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Countries of interest</label>
        <DestinationMultiSelect destinations={destinations} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Discount amount</label>
          <input name="discount_amount" type="number" step="0.01" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Discount reason</label>
          <input name="discount_reason" className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Assigned counselor</label>
        <select name="assigned_counselor_id" className={inputClass}>
          <option value="">Unassigned</option>
          {counselors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50"
      >
        {pending ? "Registering…" : "Register student"}
      </button>
    </form>
  );
}
