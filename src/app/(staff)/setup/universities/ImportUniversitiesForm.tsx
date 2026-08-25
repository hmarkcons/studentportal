"use client";

import { useActionState } from "react";
import { importUniversities } from "@/lib/actions/universities";

export function ImportUniversitiesForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(importUniversities, undefined);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import universities from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <select name="destination_id" required className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <option value="">Destination…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </select>
        <input name="file" type="file" accept=".csv" required className="text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>name</code> (required), <code>city</code>, <code>region</code>, <code>type</code>{" "}
        (public/private, defaults to public), <code>levels_offered</code>, <code>fields_offered</code> (semicolon-separated
        within a cell).
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="mt-2 text-xs text-success">Imported {state.count} universities.</p>}
    </details>
  );
}
