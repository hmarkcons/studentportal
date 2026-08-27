"use client";

import { useActionState } from "react";
import { importRegisteredStudents } from "@/lib/actions/leads";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Button } from "@/components/ui/Button";

const HEADERS = [
  "full_name",
  "contact_number",
  "email",
  "current_qualification",
  "level_applying_for",
  "course_of_interest",
  "country_of_interest",
  "date_of_birth",
  "address",
  "home_phone",
];
const EXAMPLE = [
  "Jane Doe",
  "+92 300 1234567",
  "jane@example.com",
  "A-Levels",
  "bachelors",
  "Computer Science",
  "Italy",
  "2003-05-14",
  "123 Main St, Lahore",
  "+92 42 1234567",
];

export function ImportRegisteredStudentsForm() {
  const [state, formAction, pending] = useActionState(importRegisteredStudents, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import registered students from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <Button type="submit" variant="primary" pending={pending}>
          Import
        </Button>
        <SampleCsvButton filename="registered-students-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>full_name</code> (required), plus optional <code>contact_number</code>, <code>email</code>,{" "}
        <code>current_qualification</code>, <code>level_applying_for</code>, <code>course_of_interest</code>,{" "}
        <code>country_of_interest</code>, <code>date_of_birth</code>, <code>address</code>, <code>home_phone</code>. Rows are
        inserted as already-registered students.
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-xs text-success">Imported {state.count} students.</p>}
    </details>
  );
}
