"use client";

import { useActionState } from "react";
import { createReferral } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewReferralForm({ leads }: { leads: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createReferral, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="lead_id" required>
        <option value="">Referred lead…</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {l.full_name}
          </option>
        ))}
      </Select>
      <Input name="referrer_name" placeholder="Referrer name" required className="min-w-[180px] flex-1" />
      <Input name="incentive_owed" type="number" step="0.01" placeholder="Incentive owed" className="w-36" />
      <Button type="submit" variant="primary" pending={pending}>
        Add referral
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
