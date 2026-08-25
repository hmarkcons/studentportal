"use client";

import { useActionState } from "react";
import { updateApplicationStage } from "@/lib/actions/applications";
import { MANUAL_APPLICATION_STATUSES } from "@/lib/constants";

export function StageForm({
  applicationId,
  studentId,
  currentStage,
  pipelineStages,
}: {
  applicationId: string;
  studentId: string;
  currentStage: string;
  pipelineStages: string[];
}) {
  const action = updateApplicationStage.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  const options = [...pipelineStages, ...MANUAL_APPLICATION_STATUSES];

  return (
    <form action={formAction} className="flex items-end gap-2">
      <select name="current_stage" defaultValue={currentStage} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
        {options.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
        Update stage
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
