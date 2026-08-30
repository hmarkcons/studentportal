"use client";

import { useActionState, useState } from "react";
import { createAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { extractDocxHtml } from "@/lib/extractDocxText";
import { MERGE_FIELDS } from "@/lib/pdf/templateWording";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewAgreementTemplateForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAgreementTemplate, undefined);
  const [wording, setWording] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file || !file.name.toLowerCase().endsWith(".docx")) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const html = await extractDocxHtml(file);
      setWording(html);
    } catch {
      setExtractError("Couldn't read that .docx file — you can still type/paste the wording below.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select name="destination_id" required>
          <option value="">Destination…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        <Input name="name" placeholder="Template name (e.g. Standard, Scholarship variant)" required className="min-w-[220px] flex-1" />
        <Input name="signatory_name" placeholder="Authorized signatory name" required className="min-w-[220px] flex-1" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          Upload a .docx to auto-fill the wording below with its headings/bold/italic/underline/tables preserved (optional), or
          type/paste and format it directly.
        </label>
        <input
          name="file"
          type="file"
          accept=".docx"
          className="text-sm"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {extracting && <p className="text-xs text-muted">Reading document…</p>}
        {extractError && <p className="text-xs text-danger">{extractError}</p>}
      </div>
      <RichTextEditor name="wording" content={wording} onChangeHtml={setWording} />
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Available merge fields</summary>
        <ul className="mt-1 list-disc pl-5">
          {MERGE_FIELDS.map((f) => (
            <li key={f.key}>
              <code>{`{{${f.key}}}`}</code> — {f.label}
            </li>
          ))}
        </ul>
      </details>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Add template"}
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
