"use client";

import { useActionState } from "react";
import { updateDestinationStages } from "@/lib/actions/destinations";

export function StagesForm({ destinationId, stages }: { destinationId: string; stages: string[] }) {
  const action = updateDestinationStages.bind(null, destinationId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <textarea
        name="pipeline_stages"
        rows={3}
        defaultValue={stages.join(", ")}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
      <p className="text-xs text-muted">Comma-separated, in order. Rejected/Declined/Withdrawn are always available regardless of this list.</p>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Save stages
      </button>
    </form>
  );
}
