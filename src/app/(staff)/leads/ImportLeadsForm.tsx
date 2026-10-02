"use client";

import { useActionState, useState } from "react";
import { importLeads } from "@/lib/actions/leads";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";

/**
 * The leads import: the Excel template (or an export of the list, edited)
 * or a CSV with the same headings. A lead already on file — the same email or
 * phone number — is added to, never overwritten; what the import did to each
 * is listed under it.
 */
export function ImportLeadsForm() {
  const [state, formAction, pending] = useActionState(importLeads, undefined);
  const [ready, setReady] = useState(false);
  const done = state && "success" in state ? state : null;

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import leads from Excel</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <FileField accept=".xlsx,.csv" required hint="Excel or CSV" inputClassName="text-sm" onChange={(s) => setReady(Boolean(s.file))} />
        <Button type="submit" variant="primary" pending={pending} disabled={!ready} status={{ state, label: "Imported." }}>
          Import
        </Button>
        <a
          href="/api/samples/leads"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          data-lead-template
        >
          Download template (Excel)
        </a>
      </form>
      <p className="mt-2 text-xs text-muted">
        The same columns as the list: Name is the only one needed. Month is worked out from the Inquiry date. A lead already
        on file, found by its email or phone number, is added to and never overwritten — an empty field is filled in, a new
        country, qualification, course or source is added beside the old one, a remark is added to the one there, and a
        follow-up is added.
      </p>
      {state && "error" in state && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {done && (
        <div className="mt-2 text-xs text-ink" data-import-summary>
          <p className="font-medium">
            {done.added} new {done.added === 1 ? "lead" : "leads"} added · {done.updated} already on file and added to ·{" "}
            {done.unchanged} already on file with nothing new
          </p>
          {done.notes.length > 0 && (
            <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-muted" data-import-notes>
              {done.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </details>
  );
}
