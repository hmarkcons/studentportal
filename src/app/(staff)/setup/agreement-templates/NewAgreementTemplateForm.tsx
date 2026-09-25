"use client";

import { useActionState, useState } from "react";
import { createAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { MERGE_FIELDS } from "@/lib/pdf/templateWording";
import { REFERENCE_THEME } from "@/lib/pdf/agreementTheme";
import { TemplateBuilder } from "@/components/agreement-builder/TemplateBuilder";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewAgreementTemplateForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAgreementTemplate, undefined);
  const [blocked, setBlocked] = useState(false);

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
        {/* 0279: which service this template is for. A visa-only client is
            offered visa-service templates only. */}
        <Select name="service_type" defaultValue={"full"} className="w-auto">
          <option value="full">Full service (admission and visa)</option>
          <option value="visa_only">Visa documentation &amp; application only</option>
        </Select>
      </div>
      {/* A new template starts in the HMARK Reference style — the house look
          the reference contract set; Classic is one click away in Page & theme. */}
      <TemplateBuilder kind="student" initialWording="" initialDesign={REFERENCE_THEME} mergeFields={MERGE_FIELDS} onBlockedChange={setBlocked} />
      <div>
        <Button type="submit" variant="primary" disabled={blocked} pending={pending} status={{ state, label: "Template added." }}>
          Add template
        </Button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
