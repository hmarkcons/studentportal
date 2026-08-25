"use client";

import { useActionState } from "react";
import { importPrograms } from "@/lib/actions/universities";

export function ImportProgramsForm({ universityId }: { universityId: string }) {
  const action = importPrograms.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import programs from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>level</code> (bachelors/masters/phd, required), <code>name</code> (required),{" "}
        <code>core_field</code>, <code>sub_field</code>, <code>page_link</code>, <code>interview_required</code> (yes/no),{" "}
        <code>interview_details</code>, <code>admission_test_required</code> (yes/no), <code>admission_test_type</code>,{" "}
        <code>application_portal_name</code>, <code>application_portal_link</code>,{" "}
        <code>intake_dates</code> (semicolon-separated), <code>application_deadline</code> (YYYY-MM-DD),{" "}
        <code>tuition_fee</code>, <code>duration</code>, <code>language_requirement</code>.
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-xs text-success">Imported {state.count} programs.</p>}
    </details>
  );
}
