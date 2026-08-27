"use client";

import { useActionState } from "react";
import { createAgreementTemplate } from "@/lib/actions/agreementTemplates";

export function NewAgreementTemplateForm({ destinations }: { destinations: { id: string; display_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAgreementTemplate, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="destination_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Destination…</option>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
      </select>
      <input name="signatory_name" placeholder="Authorized signatory name" required className="min-w-[220px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="file" type="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Uploading…" : "Add template"}
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
