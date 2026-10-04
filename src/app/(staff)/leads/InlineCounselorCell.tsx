"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ActionStatus } from "@/components/ActionStatus";
import { markListsStale } from "@/components/RefreshIfStale";
import { reassignLead } from "@/lib/actions/leads";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function InlineCounselorCell({
  leadId,
  currentCounselorId,
  currentCounselorName,
  counselors,
}: {
  leadId: string;
  currentCounselorId: string | null;
  currentCounselorName: string | null;
  counselors: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const action = reassignLead.bind(null, leadId);
  const [state, formAction, pending] = useActionState(action, undefined);

  // Close the panel the moment a submit succeeds — adjusted during render
  // (React's documented pattern for reacting to a changed value) rather than
  // in a useEffect, which would cascade an extra render.
  // Who was saved here, shown at once: the answer no longer carries the page
  // (reassignLead), so the list is not read again to learn it.
  const [saved, setSaved] = useState<{ id: string | null } | null>(null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "counselorId" in state) {
      setOpen(false);
      setSaved({ id: state.counselorId ?? null });
    }
  }
  // A fresh read of the list knows better than what was saved here.
  const [prevId, setPrevId] = useState(currentCounselorId);
  if (currentCounselorId !== prevId) {
    setPrevId(currentCounselorId);
    setSaved(null);
  }
  const counselorId = saved ? saved.id : currentCounselorId;
  const counselorName = saved ? (counselors.find((c) => c.id === saved.id)?.full_name ?? null) : currentCounselorName;

  if (!open) {
    // The panel closes on success, taking its Save button with it, so the
    // confirmation sits beside the control that reopens it — kept to one
    // short word so the row does not reflow.
    return (
      <span className="inline-flex items-center gap-1">
        <button onClick={() => setOpen(true)} title={counselorName ?? "Unassigned"} className="inline-flex items-center gap-1" data-lead-counselor={counselorId ?? ""}>
          {counselorName ? (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
              {initials(counselorName)}
            </span>
          ) : (
            <span className="text-xs text-muted hover:text-ink">Unassigned</span>
          )}
        </button>
        <ActionStatus state={state} label="Saved." />
      </span>
    );
  }

  return (
    <form
      action={formAction}
      // The list held for Back no longer shows this lead as it is.
      onSubmit={() => markListsStale()}
      className="flex flex-col gap-1 rounded-md border border-border bg-card p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <select name="assigned_counselor_id" defaultValue={counselorId ?? ""} className="rounded border border-border bg-card px-1 py-0.5 text-xs text-ink">
        <option value="">Unassigned</option>
        {counselors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>
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
