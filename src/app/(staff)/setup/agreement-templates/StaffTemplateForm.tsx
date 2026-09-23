"use client";

import { useActionState, useState } from "react";
import { createStaffAgreementTemplate, updateStaffAgreementTemplate } from "@/lib/actions/staffAgreements";
import { extractDocxHtml } from "@/lib/extractDocxText";
import { STAFF_MERGE_FIELDS } from "@/lib/staffAgreementFields";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileField } from "@/components/FileField";

/**
 * A staff agreement template: its name, HMARK's signatory, and the wording,
 * with {{placeholders}} filled from the staff member's record at generation.
 *
 * The student form's twin, less what only a student agreement has — a
 * destination and the payment chart.
 */
export function StaffTemplateForm({
  template,
}: {
  template?: { id: string; name: string; signatory_name: string; wording: string };
}) {
  const action = template ? updateStaffAgreementTemplate.bind(null, template.id) : createStaffAgreementTemplate;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [wording, setWording] = useState(template?.wording ?? "");
  // Remounts the editor when a .docx replaces its content, which it otherwise
  // only reads on first render.
  const [editorKey, setEditorKey] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file || !file.name.toLowerCase().endsWith(".docx")) return;
    setExtracting(true);
    setExtractError(null);
    try {
      setWording(await extractDocxHtml(file));
      setEditorKey((k) => k + 1);
    } catch {
      setExtractError("Couldn't read that .docx — you can still type or paste the wording below.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="name"
          defaultValue={template?.name}
          placeholder="Template name (e.g. Employment Agreement, Internship)"
          required
          className="min-w-[220px] flex-1"
        />
        <Input
          name="signatory_name"
          defaultValue={template?.signatory_name}
          placeholder="Authorised signatory for HMARK"
          required
          className="min-w-[220px] flex-1"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          Upload a .docx to fill in the wording below with its formatting kept (optional), or type or paste it directly.
        </label>
        <FileField accept=".docx" noun="template" hint="Word .docx" inputClassName="text-sm" onChange={(s) => void handleFile(s.file)} />
        {extracting && <p className="text-xs text-muted">Reading document…</p>}
        {extractError && <p className="text-xs text-danger">{extractError}</p>}
      </div>
      <RichTextEditor key={editorKey} name="wording" content={wording} onChangeHtml={setWording} paymentChart={false} />
      <details className="text-xs text-muted" open={!template}>
        <summary className="cursor-pointer">Available merge fields</summary>
        <p className="mt-1">
          Type these into the wording; each is replaced from the staff member&apos;s record when the agreement is generated.
          Generating is refused if the record is missing a value the wording uses, so a contract never goes out with a gap.
        </p>
        <ul className="mt-1 grid list-disc gap-x-6 pl-5 sm:grid-cols-2">
          {STAFF_MERGE_FIELDS.map((f) => (
            <li key={f.key}>
              <code>{`{{${f.key}}}`}</code> — {f.label}
            </li>
          ))}
        </ul>
      </details>
      <div>
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          status={{ state, label: template ? "Saved." : "Template added.", showError: true }}
        >
          {template ? "Save template" : "Add template"}
        </Button>
      </div>
    </form>
  );
}
