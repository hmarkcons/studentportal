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
  // "All destinations" is for the visa service only (0298), so choosing it sets the service.
  const [destination, setDestination] = useState("");
  const [service, setService] = useState("full");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          name="destination_id"
          required
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            if (e.target.value === "all") setService("visa_only");
          }}
        >
          <option value="">Destination…</option>
          <option value="all">All destinations — visa documentation service</option>
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
        <Select name="service_type" value={service} onChange={(e) => setService(e.target.value)} className="w-auto">
          <option value="full" disabled={destination === "all"}>
            Full service (admission and visa)
          </option>
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
