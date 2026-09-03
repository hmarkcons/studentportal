"use client";

import { useActionState, useState } from "react";
import { updatePartnerCommission } from "@/lib/actions/finance";
import { suggestPartnerCommission } from "./AddPartnerCommissionForm";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const inputClass = "px-2 py-1 text-xs";

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
  tuitionFee: number | null;
  configuredRatePercent: number | null;
  configuredFixedAmount: number | null;
  configuredRateCurrency: string | null;
};

const STATUSES = ["not_yet_due", "pending", "received", "partially_received", "overdue", "disputed"];

export function EditPartnerCommissionForm({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const action = updatePartnerCommission.bind(null, row.id, "/finance/partner-commissions");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [expectedAmount, setExpectedAmount] = useState(String(row.expected_amount ?? ""));
  const [ratePercent, setRatePercent] = useState(String(row.rate_percent ?? ""));
  const [fixedAmount, setFixedAmount] = useState(String(row.fixed_amount ?? ""));
  const [currency, setCurrency] = useState(row.currency);

  const suggestion = suggestPartnerCommission({
    id: row.id,
    student_id: "",
    universityName: "",
    tuitionFee: row.tuitionFee,
    ratePercent: row.configuredRatePercent,
    fixedAmount: row.configuredFixedAmount,
    rateCurrency: row.configuredRateCurrency,
  });

  function applySuggestion() {
    if (suggestion.amount != null) setExpectedAmount(String(suggestion.amount));
    if (suggestion.ratePercent != null) setRatePercent(String(suggestion.ratePercent));
    if (suggestion.fixedAmount != null) setFixedAmount(String(suggestion.fixedAmount));
    if (suggestion.currency) setCurrency(suggestion.currency);
  }

  if (!editing) {
    return (
      <Button size="sm" onClick={() => setEditing(true)}>
        ✏️ Edit
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-2 gap-1 rounded-md border border-border p-2 sm:grid-cols-4">
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Expected
        <Input name="expected_amount" type="number" step="0.01" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Paid fee
        <Input name="paid_fee" type="number" step="0.01" defaultValue={row.paid_fee ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fee payment date
        <Input name="fee_payment_date" type="date" defaultValue={row.fee_payment_date ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Currency
        <Input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Rate %
        <Input name="rate_percent" type="number" step="0.01" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fixed amount
        <Input name="fixed_amount" type="number" step="0.01" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Channel
        <Select name="channel" defaultValue={row.channel ?? ""} className={inputClass}>
          <option value="">—</option>
          <option value="wallet">wallet</option>
          <option value="direct">direct</option>
        </Select>
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Wallet platform
        <Input name="wallet_platform" defaultValue={row.wallet_platform ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Received date
        <Input name="received_date" type="date" defaultValue={row.received_date ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        HMARK bank account
        <Input name="hmark_bank_account" defaultValue={row.hmark_bank_account ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Status
        <Select name="status" defaultValue={row.status} className={inputClass}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </label>
      {suggestion.amount != null && (
        <p className="col-span-full text-[10px] text-muted">
          Configured rate: {suggestion.fixedAmount != null ? `flat ${suggestion.currency} ${suggestion.fixedAmount}` : `${suggestion.ratePercent}% of ${suggestion.currency} ${row.tuitionFee?.toFixed(2)} tuition`} (
          {suggestion.currency} {suggestion.amount}) —{" "}
          <button type="button" onClick={applySuggestion} className="text-primary hover:underline">
            use this
          </button>
        </p>
      )}
      <div className="col-span-full flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="col-span-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
