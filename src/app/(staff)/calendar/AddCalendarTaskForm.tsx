"use client";

import { useActionState, useState } from "react";
import { addApplicationTask } from "@/lib/actions/applications";

export function AddCalendarTaskForm({ applications }: { applications: { id: string; label: string }[] }) {
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const action = addApplicationTask.bind(null, applicationId, "", "/calendar");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (applications.length === 0) {
    return <p className="text-sm text-muted">No applications yet — add a student application before scheduling a task.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="rounded-md border border-border px-2 py-1.5 text-sm">
        {applications.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <input name="description" placeholder="Task" required className="min-w-[200px] flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="due_date" type="date" required className="rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="priority" defaultValue="medium" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="urgent">Urgent</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Add task
      </button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
