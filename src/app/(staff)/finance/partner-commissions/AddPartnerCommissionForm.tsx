"use client";

import { useActionState, useMemo, useState } from "react";
import { createPartnerCommission } from "@/lib/actions/finance";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function AddPartnerCommissionForm({
  students,
  applications,
}: {
  students: { id: string; full_name: string }[];
  applications: { id: string; student_id: string; universityName: string }[];
}) {
  const action = createPartnerCommission.bind(null, "/finance/partner-commissions");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [studentId, setStudentId] = useState("");

  const studentApplications = useMemo(
    () => applications.filter((a) => a.student_id === studentId),
    [applications, studentId]
  );

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Student
        <Select name="student_id" value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="w-56">
          <option value="">Student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        University (application)
        <Select name="application_id" defaultValue="" disabled={!studentId} className="w-56">
          <option value="">
            {studentId ? (studentApplications.length ? "Choose application…" : "No applications for this student") : "Choose a student first"}
          </option>
          {studentApplications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.universityName}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Expected amount
        <Input name="expected_amount" type="number" step="0.01" placeholder="Amount" className="w-32" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Currency
        <Select name="currency" defaultValue="EUR" className="w-24">
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="PKR">PKR</option>
          <option value="GBP">GBP</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Rate %
        <Input name="rate_percent" type="number" step="0.01" placeholder="e.g. 15" className="w-20" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Fixed amount
        <Input name="fixed_amount" type="number" step="0.01" placeholder="Optional" className="w-28" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Channel
        <Select name="channel" defaultValue="" className="w-28">
          <option value="">—</option>
          <option value="wallet">wallet</option>
          <option value="direct">direct</option>
        </Select>
      </label>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        + Add commission record
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
