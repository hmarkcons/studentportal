"use client";

import { useActionState } from "react";
import { updateApplicationDetails } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

export function ApplicationDetailsForm({
  applicationId,
  studentId,
  deadline,
  application_fee,
  special_requirements,
}: {
  applicationId: string;
  studentId: string;
  deadline: string | null;
  application_fee: number | null;
  special_requirements: string | null;
}) {
  const action = updateApplicationDetails.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Deadline
        <Input name="deadline" type="date" defaultValue={deadline ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application fee
        <Input name="application_fee" type="number" step="0.01" defaultValue={application_fee ?? ""} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Special requirements
        <Textarea name="special_requirements" defaultValue={special_requirements ?? ""} rows={2} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-1 text-xs text-danger">{state.error}</p>}
        <Button type="submit" size="sm" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
