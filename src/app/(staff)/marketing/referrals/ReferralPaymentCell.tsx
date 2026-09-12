"use client";

import { useState } from "react";
import { setReferralPayment } from "@/lib/actions/referralParties";
import { useSlideOverForm } from "./useSlideOverForm";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";

const METHODS = ["Bank transfer", "Cash", "Cheque", "Easypaisa", "JazzCash", "Other"];

/**
 * Records the payment of one referral commission.
 *
 * Marking it paid used to be a single button with nothing behind it — no date,
 * no method, no reference — so a payment could be declared made and then not
 * be reconcilable against anything. The date is required here and by the
 * table, because a paid row without one is a payment nobody can find.
 */
export function ReferralPaymentCell({
  id,
  paid,
  partyName,
  amountLabel,
  today,
}: {
  id: string;
  paid: boolean;
  partyName: string;
  amountLabel: string;
  /** Today in Karachi, worked out on the server — the browser's clock may be elsewhere. */
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const action = setReferralPayment.bind(null, id);
  const { onSubmit, pending, error } = useSlideOverForm(action, () => setOpen(false));

  if (paid) {
    return (
      <form onSubmit={onSubmit}>
        <input type="hidden" name="incentive_status" value="owed" />
        <Button type="submit" size="sm" pending={pending}>
          Undo payment
        </Button>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="primary" onClick={() => setOpen(true)}>
        Record payment
      </Button>
      <SlideOver open={open} onClose={() => setOpen(false)} title={`Pay ${partyName}`}>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input type="hidden" name="incentive_status" value="paid" />
          <p className="text-sm text-muted">
            Commission owed: <span className="font-medium text-ink">{amountLabel}</span>
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Paid on *</span>
            <Input name="paid_on" type="date" defaultValue={today} max={today} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Method</span>
            <Select name="payment_method" defaultValue="Bank transfer">
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Reference</span>
            <Input name="payment_reference" maxLength={120} placeholder="Transaction ID, cheque number…" />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" pending={pending}>
              Mark paid
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}
