"use client";

import { useActionState } from "react";
import { createStaffAgreementTemplate, updateStaffAgreementTemplate } from "@/lib/actions/staffAgreements";
import { STAFF_TEMPLATE_FIELDS } from "@/lib/staffAgreementFields";
import { normalizeTheme } from "@/lib/pdf/agreementTheme";
import { TemplateBuilder } from "@/components/agreement-builder/TemplateBuilder";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
  template?: { id: string; name: string; signatory_name: string; wording: string; design?: unknown };
}) {
  const action = template ? updateStaffAgreementTemplate.bind(null, template.id) : createStaffAgreementTemplate;
  const [state, formAction, pending] = useActionState(action, undefined);

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
      {/* An existing template keeps its look (Classic unless it was given one);
          a new one starts Classic too, as staff contracts always have printed. */}
      <TemplateBuilder
        kind="staff"
        initialWording={template?.wording ?? ""}
        initialDesign={normalizeTheme(template?.design ?? null)}
        mergeFields={STAFF_TEMPLATE_FIELDS}
      />
      <details className="text-xs text-muted" open={!template}>
        <summary className="cursor-pointer">Available merge fields</summary>
        <p className="mt-1">
          Type these into the wording, or pick them from <strong>+ Insert field</strong>; each is replaced from the staff member&apos;s
          record when the agreement is generated. Generating is refused if the record is missing a value the wording uses, so a
          contract never goes out with a gap.
        </p>
        <ul className="mt-1 grid list-disc gap-x-6 pl-5 sm:grid-cols-2">
          {STAFF_TEMPLATE_FIELDS.map((f) => (
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
