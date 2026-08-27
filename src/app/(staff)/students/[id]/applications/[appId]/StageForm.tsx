"use client";

import { useActionState } from "react";
import { updateApplicationStage } from "@/lib/actions/applications";
import { MANUAL_APPLICATION_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

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
      <Select name="current_stage" defaultValue={currentStage}>
        {options.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="primary" pending={pending}>
        Update stage
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
