"use client";

import { useActionState } from "react";
import { updateAgreementRate } from "@/lib/actions/agreementSettings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

/**
 * The rupees per euro a student's agreement is converted at when it is made in
 * the other currency than its country's fees (0351) — a Sweden agreement in
 * rupees, a private university's in euro. Offered on the agreement form, where
 * it can be changed for that one agreement; each agreement keeps its own.
 */
export function AgreementRateForm({ rate, canEdit }: { rate: number; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateAgreementRate, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2" data-agreement-rate-form>
      <h3 className="text-sm font-semibold text-ink">Euro rate for agreements</h3>
      <p className="text-xs text-muted">
        When an agreement is made in rupees for a country whose fees are in euro, or in euro for one whose fees are in
        rupees, every amount on it is converted at this rate. Whoever makes the agreement can change it for that one;
        an agreement already made keeps the rate it was made at.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Rupees per €1
          <Input
            name="pkr_per_eur"
            type="number"
            step="any"
            min="1"
            max="10000"
            required
            defaultValue={rate}
            disabled={!canEdit}
            className="w-36"
            aria-label="Rupees per euro for agreements"
          />
        </label>
        {canEdit && (
          <Button type="submit" variant="primary" pending={pending}>
            Save rate
          </Button>
        )}
        <ActionStatus state={state} pending={pending} showError />
      </div>
      {!canEdit && <p className="text-xs text-muted">Only a Super Admin can change it.</p>}
    </form>
  );
}
