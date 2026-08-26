"use client";

import { useActionState, useState } from "react";
import {
  addApplicationTask,
  toggleApplicationTask,
  updateApplicationTask,
  deleteApplicationTask,
} from "@/lib/actions/applications";

export type TaskRow = { id: string; description: string; due_date: string | null; status: string; priority: string; label?: string };

const PRIORITY_TONE: Record<string, string> = {
  urgent: "border-danger text-danger",
  medium: "border-warning text-warning",
  low: "border-border text-muted",
};

function TaskRowView({ task, revalidateTo }: { task: TaskRow; revalidateTo: string }) {
  const [editing, setEditing] = useState(false);
  const action = updateApplicationTask.bind(null, task.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <input name="description" defaultValue={task.description} required className="flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        <input name="due_date" type="date" defaultValue={task.due_date ?? ""} className="rounded-md border border-border px-2 py-1 text-xs" />
        <select name="priority" defaultValue={task.priority} className="rounded-md border border-border px-2 py-1 text-xs">
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-ink disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={(e) => toggleApplicationTask(task.id, revalidateTo, e.target.checked)}
      />
      <span className={task.status === "done" ? "flex-1 text-muted line-through" : "flex-1 text-ink"}>
        {task.description}
        {task.label && <span className="text-muted"> · {task.label}</span>}
      </span>
      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase ${PRIORITY_TONE[task.priority] ?? PRIORITY_TONE.medium}`}>
        {task.priority}
      </span>
      {task.due_date && <span className="text-xs text-muted">due {new Date(task.due_date).toLocaleDateString()}</span>}
      <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
        ✏️
      </button>
      <button onClick={() => deleteApplicationTask(task.id, revalidateTo)} className="text-xs text-muted hover:text-danger">
        🗑️
      </button>
    </div>
  );
}

export function TaskList({
  tasks,
  applicationId,
  revalidateTo,
}: {
  tasks: TaskRow[];
  applicationId: string;
  revalidateTo: string;
}) {
  const action = addApplicationTask.bind(null, applicationId, "", revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && <p className="text-sm text-muted">No tasks yet.</p>}
        {tasks.map((t) => (
          <TaskRowView key={t.id} task={t} revalidateTo={revalidateTo} />
        ))}
      </div>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <input name="description" placeholder="Task" required className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="due_date" type="date" className="rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="priority" defaultValue="medium" className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1.5 text-xs font-medium text-primary disabled:opacity-50">
          Add
        </button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
