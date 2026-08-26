"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { updateLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";

export function InlineStatusCell({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const [open, setOpen] = useState(false);
  const action = updateLeadStatus.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.success) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-border px-2 py-0.5 text-xs text-ink hover:border-primary">
        {LEAD_STATUS_LABELS[currentStatus as never] ?? currentStatus} · change
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1 rounded-md border border-border bg-card p-2" onClick={(e) => e.stopPropagation()}>
      <select name="status" defaultValue={currentStatus} className="rounded border border-border px-1 py-0.5 text-xs">
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <input name="remark" required placeholder="Remark (required)" className="rounded border border-border px-1 py-0.5 text-xs" />
      <div className="flex gap-1">
        <button type="submit" disabled={pending} className="rounded bg-primary px-2 py-0.5 text-xs text-primary-ink disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-2 py-0.5 text-xs text-muted">
          Cancel
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
