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
  const [, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
    </form>
  );
}
