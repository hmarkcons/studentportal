"use client";

import { useActionState, useState } from "react";
import { commitContactImport, previewContactImport } from "@/lib/actions/emailAudience";
import { IMPORT_FIELDS } from "@/lib/emailCampaigns/contactImport";
import { FileField } from "@/components/FileField";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { AddReportView } from "../lists/ListForms";

/**
 * A spreadsheet into the email audience: read the file, confirm which column
 * is which, choose the list, say where consent came from, import. One form, so
 * both steps post the same uploaded file.
 */
export function ImportWizard({ lists }: { lists: { id: string; name: string }[] }) {
  const [previewState, previewAction, previewing] = useActionState(previewContactImport, undefined);
  const [commitState, commitAction, committing] = useActionState(commitContactImport, undefined);
  const [ready, setReady] = useState(false);
  const [listId, setListId] = useState("");
  const preview = previewState && "success" in previewState ? previewState.preview : null;

  return (
    <form className="flex flex-col gap-4" data-import-wizard>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <FileField accept=".csv,text/csv" required noun="spreadsheet" hint="CSV (save the sheet as CSV from Excel or Google Sheets)" onChange={(s) => setReady(Boolean(s.file))} />
        <Button type="submit" formAction={previewAction} pending={previewing} disabled={!ready}>
          Read the file
        </Button>
      </div>
      {previewState && "error" in previewState && <p className="text-xs text-danger">{previewState.error}</p>}

      {preview && (
        <>
          <p className="text-sm text-ink">
            {preview.rows.toLocaleString("en-US")} rows. Check which column is which — guessed from the headers.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-import-mapping>
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-xs text-muted">
                {f.label}
                {"required" in f && f.required && <span className="text-danger"> *</span>}
                <Select name={`map_${f.key}`} defaultValue={preview.mapping[f.key] !== undefined ? String(preview.mapping[f.key]) : ""}>
                  <option value="">— not in the file —</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-bg text-muted">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 font-medium">
                      {h || `Column ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.sample.map((row, r) => (
                  <tr key={r}>
                    {preview.headers.map((_, i) => (
                      <td key={i} className="px-2 py-1 text-ink">
                        {row[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Into the list
              <Select name="list_id" value={listId} onChange={(e) => setListId(e.target.value)}>
                <option value="">A new list…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </label>
            {!listId && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                New list&rsquo;s name
                <Input name="new_list" maxLength={120} placeholder="e.g. Education Expo Karachi 2026" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
              Where these people agreed to hear from HMARK <span className="text-danger">*</span>
              <Input name="consent_source" required maxLength={200} placeholder="e.g. Sign-up sheet, Education Expo Karachi, November 2026" />
              <span className="text-[11px]">Recorded on every new contact; email only people who agreed to it.</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" formAction={commitAction} pending={committing}>
              Import {preview.rows.toLocaleString("en-US")} rows
            </Button>
            <span className="text-[11px] text-muted">Each new address&rsquo;s domain is asked whether it takes email, which can take a little while.</span>
          </div>
        </>
      )}
      {commitState && "error" in commitState && <p className="text-xs text-danger">{commitState.error}</p>}
      {commitState && "success" in commitState && (
        <div className="flex flex-col gap-2">
          <AddReportView report={commitState.report} />
          <a href={`/marketing/email/audience/lists/${commitState.report.listId}`} className="text-xs text-primary hover:underline">
            Open the list →
          </a>
        </div>
      )}
    </form>
  );
}
