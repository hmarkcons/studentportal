"use client";

import { useActionState } from "react";
import { importUniversities } from "@/lib/actions/universities";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

const HEADERS = ["name", "city", "region", "type", "levels_offered", "fields_offered"];
const EXAMPLE = ["Sapienza University of Rome", "Rome", "Lazio", "public", "bachelors;masters", "Engineering;IT/CS"];

export function ImportUniversitiesForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(importUniversities, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import universities from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <Select name="destination_id" required>
          <option value="">Destination…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <Button type="submit" variant="primary" pending={pending}>
          Import
        </Button>
        <SampleCsvButton filename="universities-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>name</code> and <code>city</code> (both required), <code>region</code>, <code>type</code>{" "}
        (public/private, defaults to public), <code>levels_offered</code>, <code>fields_offered</code> (semicolon-separated
        within a cell).
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-xs text-success">Imported {state.count} universities.</p>}
    </details>
  );
}
