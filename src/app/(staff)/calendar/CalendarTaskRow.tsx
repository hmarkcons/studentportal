"use client";

import { useActionState, useState } from "react";
import { toggleApplicationTask, deleteApplicationTask, updateApplicationTask } from "@/lib/actions/applications";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
        <Input name="description" defaultValue={description} required className="min-w-[160px] flex-1" />
        <Input name="due_date" type="date" defaultValue={dueDate.slice(0, 10)} />
        <Select name="priority" defaultValue={priority}>
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
