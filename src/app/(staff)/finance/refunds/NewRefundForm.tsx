"use client";

import { useActionState } from "react";
import { createRefundRequest } from "@/lib/actions/finance";

export function NewRefundForm({ students }: { students: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createRefundRequest, undefined);

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2">
      <select name="student_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="reason" placeholder="Reason" required className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add refund
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
