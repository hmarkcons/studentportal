"use client";

import { useActionState, useState } from "react";
import { updateStaffCommission } from "@/lib/actions/finance";

const inputClass = "rounded-md border border-border bg-card px-2 py-1 text-xs";

export function EditCommissionForm({
  id,
  amount,
  currency,
  registration_date,
  status,
}: {
  id: string;
  amount: number;
  currency: string;
  registration_date: string | null;
  status: string;
}) {
  const [editing, setEditing] = useState(false);
  const action = updateStaffCommission.bind(null, id, "/finance/commissions");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-ink">
        ✏️ Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input name="amount" type="number" step="0.01" defaultValue={amount} required className={`${inputClass} w-24`} />
      <input name="currency" defaultValue={currency} required className={`${inputClass} w-16`} />
      <input name="registration_date" type="date" defaultValue={registration_date ?? ""} className={inputClass} />
      <select name="status" defaultValue={status} className={inputClass}>
        <option value="unpaid">unpaid</option>
        <option value="paid">paid</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-ink disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
        Cancel
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
