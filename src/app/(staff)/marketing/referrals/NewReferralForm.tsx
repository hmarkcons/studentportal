"use client";

import { useActionState } from "react";
import { createReferral } from "@/lib/actions/marketing";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewReferralForm({
  leads,
  canSetIncentives,
}: {
  leads: { id: string; full_name: string; alreadyReferred?: boolean }[];
  /** marketing.referral_incentives — Finance, Management and Super Admin by default. */
  canSetIncentives: boolean;
}) {
  const [state, formAction, pending] = useActionState(createReferral, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="lead_id" required>
        <option value="">Referred lead…</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {/* Says so up front rather than letting somebody log a second
                referral and find out from a unique-index error. A different
                referrer for the same lead is still allowed — two people
                claiming the same introduction is a judgement for the office. */}
            {l.full_name}
            {l.alreadyReferred ? " (already referred)" : ""}
          </option>
        ))}
      </Select>
      <Input name="referrer_name" placeholder="Referrer name" required maxLength={120} className="min-w-[180px] flex-1" />
      {/* Only the roles that can actually pay it are offered the field. It used
          to be open to everyone, and any active staff member could set an
          incentive, raise it afterwards and mark it paid. */}
      {canSetIncentives && (
        <Input name="incentive_owed" type="number" step="0.01" min="0" placeholder="Incentive owed" className="w-36" />
      )}
      <Button type="submit" variant="primary" pending={pending}>
        Add referral
      </Button>
      {!canSetIncentives && (
        <p className="w-full text-xs text-muted">
          Finance sets what a referral is worth — log who referred the lead and they will price it.
        </p>
      )}
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
