"use client";

import { useActionState, useState } from "react";
import { updateRegistrationDetails } from "@/lib/actions/leads";
import { PrimaryBackupDestinationSelect } from "@/components/PrimaryBackupDestinationSelect";
import { IntakeField } from "@/components/IntakeField";
import { DestinationChangeWarning, type DestinationWork } from "./DestinationChangeWarning";
import { intakeConfigFor, type DestinationOption } from "@/app/(staff)/students/new/RegisterStudentForm";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

export function RegistrationEditForm({
  studentId,
  revalidateTo,
  destinations,
  defaultPrimaryId,
  defaultBackupIds,
  counselors,
  assignedCounselorId,
  processingOfficers,
  processingOfficerId,
  discountAmount,
  discountReason,
  intake,
  destinationWork,
}: {
  studentId: string;
  revalidateTo: string;
  destinations: DestinationOption[];
  defaultPrimaryId: string | null;
  defaultBackupIds: string[];
  counselors: { id: string; full_name: string }[];
  assignedCounselorId: string | null;
  processingOfficers: { id: string; full_name: string }[];
  processingOfficerId: string | null;
  discountAmount: number | null;
  discountReason: string | null;
  intake: string | null;
  /** What this student already has against each country. */
  destinationWork: DestinationWork[];
}) {
  const [editing, setEditing] = useState(false);
  // Starts at whatever the student is already registered for, so the intake
  // field opens on that country's shape rather than a text box.
  const [primaryId, setPrimaryId] = useState(defaultPrimaryId ?? "");
  const [backupIds, setBackupIds] = useState<string[]>(defaultBackupIds);
  const action = updateRegistrationDetails.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button data-collapsible-toggle onClick={() => setEditing(true)} className="w-fit text-xs font-medium text-primary hover:underline">
        ✏️ Edit registration
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div>
        <label className="mb-1 block text-xs text-muted">Country</label>
        <PrimaryBackupDestinationSelect
          destinations={destinations}
          defaultPrimaryId={defaultPrimaryId}
          defaultBackupIds={defaultBackupIds}
          onPrimaryChange={setPrimaryId}
          onSelectionChange={({ primaryId: p, backupIds: b }) => {
            setPrimaryId(p);
            setBackupIds(b);
          }}
        />
        {/* Nothing is blocked — dropping a country is an ordinary thing to
            do. This only means nobody finds out afterwards. */}
        <div className="mt-2">
          <DestinationChangeWarning
            work={destinationWork}
            originalPrimaryId={defaultPrimaryId}
            originalBackupIds={defaultBackupIds}
            primaryId={primaryId}
            backupIds={backupIds}
          />
        </div>
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
          Processing officer
          <Select name="processing_officer_id" defaultValue={processingOfficerId ?? ""}>
            <option value="">Whole processing team</option>
            {processingOfficers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Intake
          <IntakeField config={intakeConfigFor(destinations, primaryId)} defaultValue={intake} label="" />
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
        <ActionStatus state={state} pending={pending} label="Saved." />
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
