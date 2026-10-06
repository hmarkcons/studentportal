"use client";

import { useActionState } from "react";
import { updateApplicationStage } from "@/lib/actions/applications";
import { MANUAL_APPLICATION_STATUSES } from "@/lib/constants";
import { isFinalizedStage } from "@/lib/finalizedStage";
import { stageLabel } from "@/lib/applicationTable";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

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

  // Pre-Enrolled / University Finalized is reached by finalizing the
  // university, so it is listed only while the application stands on it.
  const options = [...pipelineStages.filter((s) => !isFinalizedStage(s) || s === currentStage), ...MANUAL_APPLICATION_STATUSES];

  return (
    <form action={formAction} className="flex items-end gap-2">
      <Select name="current_stage" defaultValue={currentStage}>
        {options.map((s) => (
          <option key={s} value={s}>
            {stageLabel(s)}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="primary" pending={pending}>
        Update stage
      </Button>
      <ActionStatus state={state} pending={pending} label="Stage updated." />
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
