"use client";

import { useState } from "react";
import { useActionState } from "react";
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
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.success) setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title={currentCounselorName ?? "Unassigned"} className="inline-flex items-center gap-1">
        {currentCounselorName ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
            {initials(currentCounselorName)}
          </span>
        ) : (
          <span className="text-xs text-muted hover:text-ink">Unassigned</span>
        )}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1 rounded-md border border-border bg-card p-2" onClick={(e) => e.stopPropagation()}>
      <select name="assigned_counselor_id" defaultValue={currentCounselorId ?? ""} className="rounded border border-border px-1 py-0.5 text-xs">
        <option value="">Unassigned</option>
        {counselors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>
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
