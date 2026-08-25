"use client";

import { useActionState } from "react";
import { createScholarshipBody } from "@/lib/actions/scholarships";

export function NewScholarshipBodyForm() {
  const [state, formAction, pending] = useActionState(createScholarshipBody, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="Scholarship body name" required className="min-w-[180px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="region" placeholder="Region" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="academic_year" placeholder="AY 2026/2027" required className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="covers" placeholder="Universities it covers (comma-separated)" className="min-w-[200px] rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="stipend_amount" placeholder="Stipend / notes" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
