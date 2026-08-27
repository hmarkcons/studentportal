"use client";

import { useActionState, useState } from "react";
import { updatePartnerCommission } from "@/lib/actions/finance";

const inputClass = "rounded-md border border-border bg-card px-2 py-1 text-xs";

type Row = {
  id: string;
  paid_fee: number | null;
  fee_payment_date: string | null;
  rate_percent: number | null;
  fixed_amount: number | null;
  currency: string;
  expected_amount: number | null;
  channel: string | null;
  wallet_platform: string | null;
  received_date: string | null;
  hmark_bank_account: string | null;
  status: string;
};

const STATUSES = ["not_yet_due", "pending", "received", "partially_received", "overdue", "disputed"];

export function EditPartnerCommissionForm({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const action = updatePartnerCommission.bind(null, row.id, "/finance/partner-commissions");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-ink">
        ✏️ Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-2 gap-1 rounded-md border border-border p-2 sm:grid-cols-4">
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Expected
        <input name="expected_amount" type="number" step="0.01" defaultValue={row.expected_amount ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Paid fee
        <input name="paid_fee" type="number" step="0.01" defaultValue={row.paid_fee ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fee payment date
        <input name="fee_payment_date" type="date" defaultValue={row.fee_payment_date ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Currency
        <input name="currency" defaultValue={row.currency} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Rate %
        <input name="rate_percent" type="number" step="0.01" defaultValue={row.rate_percent ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fixed amount
        <input name="fixed_amount" type="number" step="0.01" defaultValue={row.fixed_amount ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Channel
        <select name="channel" defaultValue={row.channel ?? ""} className={inputClass}>
          <option value="">—</option>
          <option value="wallet">wallet</option>
          <option value="direct">direct</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Wallet platform
        <input name="wallet_platform" defaultValue={row.wallet_platform ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Received date
        <input name="received_date" type="date" defaultValue={row.received_date ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        HMARK bank account
        <input name="hmark_bank_account" defaultValue={row.hmark_bank_account ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Status
        <select name="status" defaultValue={row.status} className={inputClass}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-full flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="col-span-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
