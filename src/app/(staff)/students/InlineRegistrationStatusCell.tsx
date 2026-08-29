"use client";

import { useActionState } from "react";
import { updateRegistrationStatus } from "@/lib/actions/leads";
import { Badge } from "@/components/ui/Badge";

const TONE: Record<string, "success" | "warning" | "danger"> = {
  registered: "success",
  withdrawn: "warning",
  ghost: "danger",
};

export function InlineRegistrationStatusCell({ studentId, status }: { studentId: string; status: string }) {
  const action = updateRegistrationStatus.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <Badge tone={TONE[status] ?? "neutral"}>{status}</Badge>
        <select
          name="registration_status"
          defaultValue={status}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="rounded border border-border bg-card px-1 py-0.5 text-xs"
        >
          <option value="registered">Registered</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="ghost">Ghost</option>
        </select>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
