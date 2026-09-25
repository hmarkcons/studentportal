"use client";

import { useActionState, useState } from "react";
import { updateAgreementTemplate, deleteAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { MERGE_FIELDS } from "@/lib/pdf/templateWording";
import { normalizeTheme } from "@/lib/pdf/agreementTheme";
import { TemplateBuilder } from "@/components/agreement-builder/TemplateBuilder";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

// Templates saved before the rich-text editor was added stored plain text
// (paragraphs separated by a blank line) rather than HTML — wrap each
// paragraph so the editor displays/edits them correctly instead of
// collapsing everything into one blob.
function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

export function EditAgreementTemplateForm({
  template,
  destinations,
}: {
  template: {
    id: string;
    name: string;
    signatory_name: string;
    wording: string;
    destination_id: string;
    file_path: string | null;
    service_type?: string | null;
    design?: unknown;
  };
  destinations: { id: string; display_name: string }[];
}) {
  const action = updateAgreementTemplate.bind(null, template.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [blocked, setBlocked] = useState(false);
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm("Delete this agreement template? This cannot be undone.")) return;
    // deleteAgreementTemplate redirects on success (it throws internally,
    // it never returns) — this only resolves to a value on the error path,
    // said beside the button. Success leaves the page: a toast.
    await del.run(() => deleteAgreementTemplate(template.id), { toast: "Deleted." });
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
        {/* 0279: which service this template is for. A visa-only client is
            offered visa-service templates only. */}
        <Select name="service_type" defaultValue={template.service_type ?? "full"} className="w-auto">
          <option value="full">Full service (admission and visa)</option>
          <option value="visa_only">Visa documentation &amp; application only</option>
        </Select>
      </div>
      <TemplateBuilder
        kind="student"
        initialWording={plainTextToHtml(template.wording)}
        initialDesign={normalizeTheme(template.design ?? null)}
        mergeFields={MERGE_FIELDS}
        onBlockedChange={setBlocked}
        importHint="Replace the wording with a Word document (.docx): it comes across with its fonts, colours, headings, bullets and tables, and Page & theme is set to match it. Or edit directly below."
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={blocked} pending={pending} status={{ state, label: "Saved." }}>
          Save changes
        </Button>
        <button
          type="button"
          className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
          onClick={handleDelete}
          disabled={del.pending}
          aria-busy={del.pending || undefined}
        >
          Delete template
        </button>
        <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
