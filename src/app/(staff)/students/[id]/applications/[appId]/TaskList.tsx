"use client";

import { useActionState } from "react";
import { addApplicationTask, toggleApplicationTask } from "@/lib/actions/applications";

export type TaskRow = { id: string; description: string; due_date: string | null; status: string };

export function TaskList({ tasks, applicationId, studentId }: { tasks: TaskRow[]; applicationId: string; studentId: string }) {
  const action = addApplicationTask.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && <p className="text-sm text-muted">No tasks yet.</p>}
        {tasks.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={(e) => toggleApplicationTask(t.id, applicationId, studentId, e.target.checked)}
            />
            <span className={t.status === "done" ? "text-muted line-through" : "text-ink"}>{t.description}</span>
            {t.due_date && <span className="text-xs text-muted">· due {new Date(t.due_date).toLocaleDateString()}</span>}
          </label>
        ))}
      </div>
      <form action={formAction} className="mt-3 flex items-end gap-2 border-t border-border pt-3">
        <input name="description" placeholder="Task" required className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="due_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
          Add
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
