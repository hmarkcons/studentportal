"use client";

import { useActionState } from "react";
import { createReferral } from "@/lib/actions/marketing";

export function NewReferralForm({ leads }: { leads: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createReferral, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="lead_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Referred lead…</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {l.full_name}
          </option>
        ))}
      </select>
      <input name="referrer_name" placeholder="Referrer name" required className="min-w-[180px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="incentive_owed" type="number" step="0.01" placeholder="Incentive owed" className="w-36 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add referral
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
