"use client";

import { useActionState, useState } from "react";
import { updateAgreementTemplate, deleteAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { extractDocxText } from "@/lib/extractDocxText";
import { MERGE_FIELDS } from "@/lib/pdf/templateWording";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

export function EditAgreementTemplateForm({
  template,
  destinations,
}: {
  template: { id: string; name: string; signatory_name: string; wording: string; destination_id: string; file_path: string | null };
  destinations: { id: string; display_name: string }[];
}) {
  const action = updateAgreementTemplate.bind(null, template.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [wording, setWording] = useState(template.wording);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this agreement template? This cannot be undone.")) return;
    setDeleteError(null);
    // deleteAgreementTemplate redirects on success (it throws internally,
    // it never returns) — this only resolves to a value on the error path.
    const result = await deleteAgreementTemplate(template.id);
    if (result?.error) setDeleteError(result.error);
  }

  async function handleFile(file: File | null) {
    if (!file || !file.name.toLowerCase().endsWith(".docx")) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const text = await extractDocxText(file);
      setWording(text);
    } catch {
      setExtractError("Couldn't read that .docx file — you can still type/paste the wording below.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select name="destination_id" defaultValue={template.destination_id} required>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
        <Input name="name" defaultValue={template.name} placeholder="Template name" required className="min-w-[220px] flex-1" />
        <Input
          name="signatory_name"
          defaultValue={template.signatory_name}
          placeholder="Authorized signatory name"
          required
          className="min-w-[220px] flex-1"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          Replace with a new .docx to re-fill the wording below (optional), or edit the text directly.
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
      <Textarea name="wording" value={wording} onChange={(e) => setWording(e.target.value)} rows={16} />
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
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <button type="button" className="text-xs text-danger hover:underline" onClick={handleDelete}>
          Delete template
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
    </form>
  );
}
