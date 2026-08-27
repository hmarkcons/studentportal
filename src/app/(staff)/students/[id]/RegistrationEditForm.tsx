"use client";

import { useActionState, useState } from "react";
import { updateRegistrationDetails } from "@/lib/actions/leads";
import { DestinationMultiSelect } from "@/components/DestinationMultiSelect";

const inputClass = "rounded-md border border-border bg-card px-2 py-1.5 text-sm";

export function RegistrationEditForm({
  studentId,
  revalidateTo,
  destinations,
  selectedDestinationIds,
  counselors,
  assignedCounselorId,
  discountAmount,
  discountReason,
}: {
  studentId: string;
  revalidateTo: string;
  destinations: { id: string; display_name: string }[];
  selectedDestinationIds: string[];
  counselors: { id: string; full_name: string }[];
  assignedCounselorId: string | null;
  discountAmount: number | null;
  discountReason: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const action = updateRegistrationDetails.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-medium text-primary hover:underline">
        ✏️ Edit registration
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div>
        <label className="mb-1 block text-xs text-muted">Countries</label>
        <DestinationMultiSelect destinations={destinations} defaultSelected={selectedDestinationIds} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assigned counselor
          <select name="assigned_counselor_id" defaultValue={assignedCounselorId ?? ""} className={inputClass}>
            <option value="">Unassigned</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Discount amount
          <input name="discount_amount" type="number" step="0.01" defaultValue={discountAmount ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Discount reason
          <input name="discount_reason" defaultValue={discountReason ?? ""} className={inputClass} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
