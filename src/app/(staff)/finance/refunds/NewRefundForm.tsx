"use client";

import { useActionState } from "react";
import { createRefundRequest } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function NewRefundForm({ students }: { students: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createRefundRequest, undefined);

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2">
      <Select name="student_id" required>
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </Select>
      <Select name="trigger_type" defaultValue="manual">
        <option value="manual">Manual</option>
        <option value="no_admission">No admission — 100%</option>
        <option value="visa_refusal">Visa refusal (private) — 50%</option>
      </Select>
      <Input name="refusal_notice_date" type="date" className="w-40" title="Refusal notice date" />
      <Input name="amount" type="number" step="0.01" placeholder="Amount (auto if blank)" className="w-40" />
      <Input name="reason" placeholder="Reason" required className="min-w-[200px] flex-1" />
      <Button type="submit" variant="primary" pending={pending}>
        Add refund
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
