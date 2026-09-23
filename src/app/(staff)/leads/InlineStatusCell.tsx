"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ActionStatus } from "@/components/ActionStatus";
import { updateLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";

export function InlineStatusCell({
  leadId,
  currentStatus,
  latestRemark,
}: {
  leadId: string;
  currentStatus: string;
  latestRemark?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const action = updateLeadStatus.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);

  // Close the panel the moment a submit succeeds — adjusted during render
  // (React's documented pattern for reacting to a changed value) rather than
  // in a useEffect, which would cascade an extra render.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  if (!open) {
    // The panel closes on success, taking its Save button with it, so the
    // confirmation sits beside the control that reopens it — kept to one
    // short word so the row does not reflow.
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => setOpen(true)}
          title={latestRemark ?? undefined}
          className="rounded-full border border-border px-2 py-0.5 text-xs text-ink hover:border-primary"
        >
          {LEAD_STATUS_LABELS[currentStatus as never] ?? currentStatus} · change
        </button>
        <ActionStatus state={state} label="Saved." />
      </span>
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
        <button type="submit" disabled={pending} className="w-fit rounded bg-primary px-2 py-0.5 text-xs text-primary-ink disabled:opacity-50">
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
