"use client";

import { useActionState } from "react";
import { updateLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";

export function CallLogForm({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const action = updateLeadStatus.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Update status</label>
        <Select name="status" defaultValue={currentStatus} className="px-3 py-2">
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Remark (required — creates a call log entry)</label>
        <Textarea name="remark" required rows={2} className="px-3 py-2" />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Log call & update status"}
      </Button>
    </form>
  );
}
