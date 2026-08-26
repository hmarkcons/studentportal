"use client";

import { useActionState, useState } from "react";
import { toggleApplicationTask, deleteApplicationTask, updateApplicationTask } from "@/lib/actions/applications";
import { Badge } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  medium: "warning",
  low: "neutral",
};

export function CalendarTaskRow({
  taskId,
  label,
  description,
  dueDate,
  priority,
  tone,
}: {
  taskId: string;
  label: string;
  description: string;
  dueDate: string;
  priority: string;
  tone: "warning" | "danger" | "info";
}) {
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const action = updateApplicationTask.bind(null, taskId, "/calendar");
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <input name="description" defaultValue={description} required className="min-w-[160px] flex-1 rounded-md border border-border px-2 py-1 text-xs" />
        <input name="due_date" type="date" defaultValue={dueDate.slice(0, 10)} className="rounded-md border border-border px-2 py-1 text-xs" />
        <select name="priority" defaultValue={priority} className="rounded-md border border-border px-2 py-1 text-xs">
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
    <div className="flex items-center justify-between text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            setDone(e.target.checked);
            toggleApplicationTask(taskId, "/calendar", e.target.checked);
          }}
        />
        <span className={done ? "text-muted line-through" : "text-ink"}>{label}</span>
      </label>
      <div className="flex items-center gap-2">
        <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
        <Badge tone={tone}>Task</Badge>
        <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
          ✏️
        </button>
        <button onClick={() => deleteApplicationTask(taskId, "/calendar")} className="text-xs text-muted hover:text-danger">
          🗑️
        </button>
      </div>
    </div>
  );
}
