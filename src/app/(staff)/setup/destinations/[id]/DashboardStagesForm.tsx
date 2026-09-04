"use client";

import { useActionState } from "react";
import { updateDashboardPipelineStages } from "@/lib/actions/destinations";
import { formatDashboardStagesText, type DashboardStageDef } from "@/lib/dashboardPipeline";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export function DashboardStagesForm({ destinationId, stages }: { destinationId: string; stages: DashboardStageDef[] }) {
  const action = updateDashboardPipelineStages.bind(null, destinationId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea name="dashboard_pipeline_stages" rows={Math.max(6, stages.length)} defaultValue={formatDashboardStagesText(stages)} />
      <p className="text-xs text-muted">
        One stage per line, as &quot;Label: option1/option2&quot;. A single option (e.g. &quot;Completed&quot;) is a checkbox; &quot;Date&quot; is a
        date field; 2+ options is a dropdown.
      </p>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" className="self-start" pending={pending}>
        Save stages
      </Button>
    </form>
  );
}
