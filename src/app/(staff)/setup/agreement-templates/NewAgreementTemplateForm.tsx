"use client";

import { useActionState } from "react";
import { createAgreementTemplate } from "@/lib/actions/agreementTemplates";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewAgreementTemplateForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAgreementTemplate, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="destination_id" required>
        <option value="">Destination…</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </Select>
      <Input name="signatory_name" placeholder="Authorized signatory name" required className="min-w-[220px] flex-1" />
      <input name="file" type="file" required className="text-sm" />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Uploading…" : "Add template"}
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
