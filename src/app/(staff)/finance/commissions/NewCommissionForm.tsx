"use client";

import { useActionState } from "react";
import { createStaffCommission } from "@/lib/actions/finance";

export function NewCommissionForm({ staff, students }: { staff: { id: string; full_name: string }[]; students: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createStaffCommission, undefined);

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2">
      <select name="staff_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Staff…</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <select name="student_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" required className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="currency" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="EUR">EUR</option>
        <option value="PKR">PKR</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add commission
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
