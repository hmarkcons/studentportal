"use client";

import { useActionState } from "react";
import { partnerAddProgram } from "@/lib/actions/partner";

const STUDY_LEVELS = ["bachelors", "masters", "phd"];

export function AddProgramForm() {
  const [state, formAction, pending] = useActionState(partnerAddProgram, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="level" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        {STUDY_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <input name="name" placeholder="Program name" required className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="core_field" placeholder="Core field" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="sub_field" placeholder="Sub-field" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="duration" placeholder="Duration" className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="tuition_fee" type="number" step="0.01" placeholder="Tuition fee" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="language_requirement" placeholder="Language requirement" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application deadline
        <input name="application_deadline" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Adding…" : "Add program"}
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
