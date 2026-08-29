"use client";

import { useActionState } from "react";
import { importPrograms } from "@/lib/actions/universities";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Button } from "@/components/ui/Button";

const HEADERS = [
  "level",
  "name",
  "core_field",
  "sub_field",
  "page_link",
  "interview_required",
  "interview_details",
  "admission_test_required",
  "admission_test_type",
  "application_portal_name",
  "application_portal_link",
  "intake_dates",
  "application_deadline",
  "tuition_fee",
  "duration",
  "language_requirement",
];
const EXAMPLE = [
  "bachelors",
  "Computer Science",
  "IT/CS",
  "Software Engineering",
  "https://example.edu/cs",
  "no",
  "",
  "yes",
  "TOLC",
  "Universitaly",
  "https://universitaly.it",
  "Fall;Spring",
  "2026-08-01",
  "3000",
  "3 years",
  "B2 English",
];

export function ImportProgramsForm({ universityId }: { universityId: string }) {
  const action = importPrograms.bind(null, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import programs from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <Button type="submit" variant="primary" pending={pending}>
          Import
        </Button>
        <SampleCsvButton filename="programs-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
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
      {state?.success && (
        <p className="mt-2 text-xs text-success">
          Imported {state.count} programs.{state.skipped ? ` Skipped ${state.skipped} already in this university.` : ""}
        </p>
      )}
    </details>
  );
}
