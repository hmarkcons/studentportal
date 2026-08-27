"use client";

import { useActionState } from "react";
import { partnerUpdateStage } from "@/lib/actions/partner";
import { MANUAL_APPLICATION_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

export function PartnerStageForm({ applicationId, currentStage, pipelineStages }: { applicationId: string; currentStage: string; pipelineStages: string[] }) {
  const action = partnerUpdateStage.bind(null, applicationId);
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
      <Button type="submit" pending={pending} variant="primary">
        Update status
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
