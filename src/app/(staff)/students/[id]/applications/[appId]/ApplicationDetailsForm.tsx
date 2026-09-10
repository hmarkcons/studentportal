"use client";

import { useActionState } from "react";
import { updateApplicationDetails } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

export function ApplicationDetailsForm({
  applicationId,
  studentId,
  deadline,
  application_fee,
  special_requirements,
  intake,
  programId,
  programs,
  isFinalized,
  universityName,
}: {
  applicationId: string;
  studentId: string;
  deadline: string | null;
  application_fee: number | null;
  special_requirements: string | null;
  intake: string | null;
  programId: string | null;
  /** Every programme at this application's university. */
  programs: { id: string; name: string }[];
  /** Finalised for the visa: the programme is what the visa record describes. */
  isFinalized: boolean;
  universityName: string;
}) {
  const action = updateApplicationDetails.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* The programme and the intake were not editable at all: a mis-keyed
          programme could only be fixed by deleting the application and making
          a new one, which takes its tasks, documents, interviews and stage
          history with it. */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Programme
        {isFinalized ? (
          <>
            <Input value={programs.find((p) => p.id === programId)?.name ?? "Not set"} disabled readOnly />
            <span className="text-xs text-muted">
              Fixed while this application is finalised for the visa — un-finalise it first if the programme has really
              changed.
            </span>
          </>
        ) : (
          <>
            <Select name="program_id" defaultValue={programId ?? ""}>
              <option value="">No programme chosen yet</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">Programmes at {universityName}.</span>
          </>
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Intake
        <Input name="intake" defaultValue={intake ?? ""} placeholder="e.g. Fall 2026" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline
        <Input name="deadline" type="date" defaultValue={deadline ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application fee
        <Input name="application_fee" type="number" step="0.01" min="0" defaultValue={application_fee ?? ""} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Special requirements
        <Textarea name="special_requirements" defaultValue={special_requirements ?? ""} rows={2} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-1 text-xs text-danger">{state.error}</p>}
        {state?.success && <p className="mb-1 text-xs text-success">Saved.</p>}
        <Button type="submit" size="sm" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
