"use client";

import { useActionState } from "react";
import { addProgram } from "@/lib/actions/universities";
import { STUDY_LEVELS } from "@/lib/constants";

export function AddProgramForm({ universityId }: { universityId: string }) {
  const action = addProgram.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

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
      <input name="tuition_fee" type="number" step="0.01" placeholder="Tuition fee" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add program
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
