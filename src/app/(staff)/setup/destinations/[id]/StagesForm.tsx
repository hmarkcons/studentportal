"use client";

import { useActionState } from "react";
import { updateDestinationStages } from "@/lib/actions/destinations";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

export function StagesForm({ destinationId, stages }: { destinationId: string; stages: string[] }) {
  const action = updateDestinationStages.bind(null, destinationId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea name="pipeline_stages" rows={3} defaultValue={stages.join(", ")} />
      <p className="text-xs text-muted">Comma-separated, in order. Rejected/Declined/Withdrawn are always available regardless of this list.</p>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" className="self-start" pending={pending}>
        Save stages
      </Button>
    </form>
  );
}
