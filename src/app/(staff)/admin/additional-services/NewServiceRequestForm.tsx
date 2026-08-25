"use client";

import { useActionState } from "react";
import { createServiceRequest } from "@/lib/actions/admin";

const SERVICE_TYPES = [
  "ibcc_attestation",
  "hec_attestation",
  "apostille",
  "mofa_attestation",
  "family_income_certificate",
  "property_certificate",
  "affidavits",
  "cimea_payment",
  "visa_appointments",
];

export function NewServiceRequestForm({ students }: { students: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createServiceRequest, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="student_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name}
          </option>
        ))}
      </select>
      <select name="service_type" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        {SERVICE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <input name="country_applying_to" placeholder="Country" className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="total_fee_paid" type="number" step="0.01" placeholder="Fee paid" className="w-28 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add request
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
