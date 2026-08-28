"use client";

import { useActionState, useState } from "react";
import { togglePersonalTask, deletePersonalTask, updatePersonalTask } from "@/lib/actions/personalTasks";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  medium: "warning",
  low: "neutral",
};

export function PersonalTaskRow({
  taskId,
  title,
  description,
  dueDate,
  dueTime,
  priority,
  done,
  revalidateTo,
}: {
  taskId: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  done: boolean;
  revalidateTo: string;
}) {
  const [checked, setChecked] = useState(done);
  const [editing, setEditing] = useState(false);
  const action = updatePersonalTask.bind(null, taskId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <Input name="title" defaultValue={title} required className="min-w-[160px] flex-1" />
        <Input name="due_date" type="date" defaultValue={dueDate} required />
        <Input name="due_time" type="time" defaultValue={dueTime ?? ""} />
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
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            togglePersonalTask(taskId, revalidateTo, e.target.checked);
          }}
        />
        <span className={checked ? "text-muted line-through" : "text-ink"}>
          {dueTime && <span className="mr-1 font-mono text-xs text-muted">{dueTime}</span>}
          {title}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
        <Badge tone="primary">Personal</Badge>
        <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
          ✏️
        </button>
        <button onClick={() => deletePersonalTask(taskId, revalidateTo)} className="text-xs text-muted hover:text-danger">
          🗑️
        </button>
      </div>
    </div>
  );
}
