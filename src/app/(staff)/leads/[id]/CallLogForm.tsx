"use client";

import { useActionState } from "react";
import { updateLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";

export function CallLogForm({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const action = updateLeadStatus.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Update status</label>
        <select
          name="status"
          defaultValue={currentStatus}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">Remark (required — creates a call log entry)</label>
        <textarea
          name="remark"
          required
          rows={2}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50"
      >
        {pending ? "Saving…" : "Log call & update status"}
      </button>
    </form>
  );
}
