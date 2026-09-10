"use client";

import { updateReferralIncentiveAmount } from "@/lib/actions/marketing";
import { SpendInput } from "@/components/SpendInput";

/**
 * What a referral is worth.
 *
 * incentive_owed could only ever be set at the moment the referral was logged
 * — which is exactly when nobody knows it yet, since a referral is normally
 * recorded when the student walks in and priced when they register. The
 * alternative was to delete the referral and log it again.
 */
export function IncentiveAmountInput({ id, amount }: { id: string; amount: number | null }) {
  return (
    <SpendInput
      value={amount}
      onSave={(next) => updateReferralIncentiveAmount(id, next)}
      placeholder="Incentive"
      className="w-24"
    />
  );
}
