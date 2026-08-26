"use client";

import { useActionState } from "react";
import { importLeads } from "@/lib/actions/leads";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";

const HEADERS = [
  "full_name",
  "contact_number",
  "email",
  "platform_source",
  "current_qualification",
  "level_applying_for",
  "course_of_interest",
  "country_of_interest",
];
const EXAMPLE = ["Jane Doe", "+92 300 1234567", "jane@example.com", "Referral", "A-Levels", "bachelors", "Computer Science", "Italy"];

export function ImportLeadsForm() {
  const [state, formAction, pending] = useActionState(importLeads, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import leads from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Importing…" : "Import"}
        </button>
        <SampleCsvButton filename="leads-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>full_name</code> (required), plus optional <code>contact_number</code>, <code>email</code>,{" "}
        <code>platform_source</code>, <code>current_qualification</code>, <code>level_applying_for</code>{" "}
        (bachelors/masters/phd), <code>course_of_interest</code>, <code>country_of_interest</code>.
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-xs text-success">Imported {state.count} leads.</p>}
    </details>
  );
}
