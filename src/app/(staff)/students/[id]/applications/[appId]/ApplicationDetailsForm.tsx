"use client";

import { useActionState } from "react";
import { updateApplicationDetails } from "@/lib/actions/applications";

const inputClass = "rounded-md border border-border bg-card px-2 py-1.5 text-sm";

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
        <input name="deadline" type="date" defaultValue={deadline ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Application fee
        <input name="application_fee" type="number" step="0.01" defaultValue={application_fee ?? ""} className={inputClass} />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
        Special requirements
        <textarea name="special_requirements" defaultValue={special_requirements ?? ""} rows={2} className={inputClass} />
      </label>
      <div className="col-span-full">
        {state?.error && <p className="mb-1 text-xs text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
