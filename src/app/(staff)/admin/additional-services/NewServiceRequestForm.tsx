"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createServiceRequest } from "@/lib/actions/admin";
import {
  ADDITIONAL_SERVICE_TYPES,
  ADDITIONAL_SERVICE_LABELS,
  ADDITIONAL_SERVICE_FIELDS,
} from "@/lib/additionalServiceFields";

const inputClass = "rounded-md border border-border px-2 py-1.5 text-sm";

export function NewServiceRequestForm({ students }: { students: { id: string; full_name: string }[] }) {
  const [serviceType, setServiceType] = useState<(typeof ADDITIONAL_SERVICE_TYPES)[number]>(ADDITIONAL_SERVICE_TYPES[0]);
  const [state, formAction, pending] = useActionState(createServiceRequest, undefined);
  const extraFields = ADDITIONAL_SERVICE_FIELDS[serviceType] ?? [];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <select name="student_id" required className={inputClass}>
          <option value="">Student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select
          name="service_type"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as typeof serviceType)}
          className={inputClass}
        >
          {ADDITIONAL_SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {ADDITIONAL_SERVICE_LABELS[t]}
            </option>
          ))}
        </select>
        <input name="passport_number" placeholder="Passport number" className={inputClass} />
        <input name="country_applying_to" placeholder="Country applying to" className={inputClass} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Documents submission date
          <input name="documents_submission_date" type="date" className={inputClass} />
        </label>
        <input name="required_document_names" placeholder="Required documents (comma-separated)" className={inputClass} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input name="documents_received" type="checkbox" className="h-4 w-4" />
          Documents received
        </label>
        <input name="pending_documents" placeholder="Pending documents (comma-separated)" className={inputClass} />
        <input name="total_fee_paid" type="number" step="0.01" placeholder="Total fee paid" className={inputClass} />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fee receiving date
          <input name="fee_receiving_date" type="date" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Delivery date
          <input name="delivery_date" type="date" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Proof of payment
          <input name="proof_of_payment" type="file" className="text-xs" />
        </label>
      </div>

      {extraFields.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            {ADDITIONAL_SERVICE_LABELS[serviceType]} details
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extraFields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted">{f.label}</label>
                {f.type === "boolean" ? (
                  <input type="checkbox" name={`extra_${f.key}`} className="h-4 w-4 self-start" />
                ) : f.type === "select" ? (
                  <select name={`extra_${f.key}`} className={inputClass}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} name={`extra_${f.key}`} className={inputClass} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <input type="hidden" name="extra_field_keys" value={extraFields.map((f) => f.key).join(",")} />

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add request"}
      </button>
    </form>
  );
}
