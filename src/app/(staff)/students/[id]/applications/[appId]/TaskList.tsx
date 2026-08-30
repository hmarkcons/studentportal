"use client";

import { useActionState, useState } from "react";
import {
  addApplicationTask,
  toggleApplicationTask,
  updateApplicationTask,
  deleteApplicationTask,
} from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

export type TaskRow = { id: string; description: string; due_date: string | null; status: string; priority: string; label?: string };

const PRIORITY_TONE: Record<string, string> = {
  urgent: "border-danger text-danger",
  medium: "border-warning text-warning",
  low: "border-border text-muted",
};

function TaskRowView({ task, revalidateTo }: { task: TaskRow; revalidateTo: string }) {
  const [editing, setEditing] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const action = updateApplicationTask.bind(null, task.id, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleToggle(checked: boolean) {
    setRowError(null);
    const result = await toggleApplicationTask(task.id, revalidateTo, checked);
    if (result?.error) setRowError(result.error);
  }

  async function handleDelete() {
    setRowError(null);
    const result = await deleteApplicationTask(task.id, revalidateTo);
    if (result?.error) setRowError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <Input name="description" defaultValue={task.description} required className="flex-1" />
        <Input name="due_date" type="date" defaultValue={task.due_date ?? ""} />
        <Select name="priority" defaultValue={task.priority}>
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={task.status === "done"} onChange={(e) => handleToggle(e.target.checked)} />
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
        <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
          🗑️
        </button>
      </div>
      {rowError && <p className="text-xs text-danger">{rowError}</p>}
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
        {tasks.length === 0 && <EmptyState>No tasks yet.</EmptyState>}
        {tasks.map((t) => (
          <TaskRowView key={t.id} task={t} revalidateTo={revalidateTo} />
        ))}
      </div>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <Input name="description" placeholder="Task" required className="flex-1" />
        <Input name="due_date" type="date" />
        <Select name="priority" defaultValue="medium">
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button type="submit" size="sm" pending={pending}>
          Add
        </Button>
      </form>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
