"use client";

import { useActionState, useState } from "react";
import { updateRegistrationDetails } from "@/lib/actions/leads";
import { DestinationMultiSelect } from "@/components/DestinationMultiSelect";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function RegistrationEditForm({
  studentId,
  revalidateTo,
  destinations,
  selectedDestinationIds,
  counselors,
  assignedCounselorId,
  discountAmount,
  discountReason,
  intake,
}: {
  studentId: string;
  revalidateTo: string;
  destinations: { id: string; display_name: string }[];
  selectedDestinationIds: string[];
  counselors: { id: string; full_name: string }[];
  assignedCounselorId: string | null;
  discountAmount: number | null;
  discountReason: string | null;
  intake: string | null;
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Assigned counselor
          <Select name="assigned_counselor_id" defaultValue={assignedCounselorId ?? ""}>
            <option value="">Unassigned</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Intake
          <Input name="intake" placeholder="e.g. Fall 2026" defaultValue={intake ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Discount amount
          <Input name="discount_amount" type="number" step="0.01" defaultValue={discountAmount ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Discount reason
          <Input name="discount_reason" defaultValue={discountReason ?? ""} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
