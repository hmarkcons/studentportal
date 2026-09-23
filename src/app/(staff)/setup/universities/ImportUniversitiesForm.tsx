"use client";

import { useActionState, useState } from "react";
import { importUniversities } from "@/lib/actions/universities";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";
import { Select } from "@/components/ui/Input";
import { ImportReportPanel } from "@/components/ImportReportPanel";

const HEADERS = ["name", "city", "region", "type", "levels_offered", "fields_offered", "contact_email"];
const EXAMPLE = [
  "Sapienza University of Rome",
  "Rome",
  "Lazio",
  "public",
  "bachelors;masters",
  "Engineering;IT/CS",
  "admissions@example.edu",
];

export function ImportUniversitiesForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(importUniversities, undefined);
  const [ready, setReady] = useState(false);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import universities from a spreadsheet</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <Select name="destination_id" required>
          <option value="">Destination…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        <FileField
          accept=".xlsx,.csv"
          required
          hint="Excel or CSV"
          inputClassName="text-sm"
          onChange={(s) => setReady(Boolean(s.file))}
        />
        <Button type="submit" variant="primary" pending={pending} disabled={!ready}>
          Import
        </Button>
        <SampleCsvButton filename="universities-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
      </form>

      <p className="mt-2 text-xs text-muted">
        Columns: <code>name</code> (required), <code>city</code>, <code>region</code>, <code>type</code>{" "}
        (public/private — a new university defaults to the destination&rsquo;s own track), <code>levels_offered</code>,{" "}
        <code>fields_offered</code>, <code>contact_email</code>. The list columns are semicolon-separated within one
        cell. A university that is new needs a <code>city</code>.
      </p>
      <p className="mt-1 text-xs text-muted">
        A name already on file is <strong className="text-ink">updated</strong>, not skipped.{" "}
        <strong className="text-ink">An empty cell changes nothing</strong> — so a sheet of just names and cities
        leaves every other column alone, and the import can never blank a field. To clear one, use the university&rsquo;s
        own edit form, where you can see what you are removing. Only a Super Admin may overwrite; anyone else can still
        add new universities.
      </p>

      <ImportReportPanel state={state} />
    </details>
  );
}
