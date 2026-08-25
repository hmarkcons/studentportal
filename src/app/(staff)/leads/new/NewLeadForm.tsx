"use client";

import { useActionState } from "react";
import { createLead } from "@/lib/actions/leads";
import { STUDY_LEVELS } from "@/lib/constants";

const inputClass = "rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-sm font-medium text-ink";

export function NewLeadForm({ counselors }: { counselors: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createLead, undefined);

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
      <div className="flex flex-col gap-1.5">
        <label className={labelClass}>Platform / source</label>
        <input name="platform_source" placeholder="e.g. Facebook, Referral, Walk-in" className={inputClass} />
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
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Course of interest</label>
          <input name="course_of_interest" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Country of interest</label>
          <input name="country_of_interest" className={inputClass} />
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
        {pending ? "Saving…" : "Create lead"}
      </button>
    </form>
  );
}
