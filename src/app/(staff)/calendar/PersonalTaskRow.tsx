"use client";

import { useActionState, useState } from "react";
import { togglePersonalTask, deletePersonalTask, updatePersonalTask } from "@/lib/actions/personalTasks";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EventFieldsFieldset } from "./EventFieldsFieldset";
import type { CalendarRecurrence } from "./types";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  medium: "warning",
  low: "neutral",
};

const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Repeats daily",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
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
  allDay = false,
  endDate,
  color,
  guestEmails = [],
  recurrence = "none",
  recurrenceEndDate,
  isRecurrenceInstance,
}: {
  taskId: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  done: boolean;
  revalidateTo: string;
  allDay?: boolean;
  endDate?: string | null;
  color?: string | null;
  guestEmails?: string[];
  recurrence?: CalendarRecurrence;
  recurrenceEndDate?: string | null;
  isRecurrenceInstance?: boolean;
}) {
  const [checked, setChecked] = useState(done);
  const [editing, setEditing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updatePersonalTask.bind(null, taskId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    setDeleteError(null);
    const result = await deletePersonalTask(taskId, revalidateTo);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-2">
        {isRecurrenceInstance && (
          <p className="text-xs text-muted">This reminder repeats — changes here apply to the whole series.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Input name="title" defaultValue={title} required className="min-w-[160px] flex-1" />
          <Input name="due_date" type="date" defaultValue={dueDate} required />
          <Select name="priority" defaultValue={priority}>
            <option value="urgent">Urgent</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <EventFieldsFieldset
          allDayDefault={allDay}
          timeDefault={dueTime}
          endDateDefault={endDate}
          notesDefault={description}
          colorDefault={color}
          guestEmailsDefault={guestEmails}
          recurrenceDefault={recurrence}
          recurrenceEndDateDefault={recurrenceEndDate}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            Save
          </Button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
            Cancel
          </button>
        </div>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={async (e) => {
              const next = e.target.checked;
              const previous = checked;
              setChecked(next);
              setToggleError(null);
              const result = await togglePersonalTask(taskId, revalidateTo, next);
              if (result?.error) {
                setToggleError(result.error);
                setChecked(previous);
              }
            }}
          />
          <span className={checked ? "text-muted line-through" : "text-ink"}>
            {!allDay && dueTime && <span className="mr-1 font-mono text-xs text-muted">{dueTime}</span>}
            {title}
          </span>
          {recurrence !== "none" && (
            <span title={RECURRENCE_LABEL[recurrence]} className="text-xs text-muted">
              🔁
            </span>
          )}
          {guestEmails.length > 0 && (
            <span title={`Guests: ${guestEmails.join(", ")}`} className="text-xs text-muted">
              👥
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
          <Badge tone="primary">Personal</Badge>
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
            🗑️
          </button>
        </div>
      </div>
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
      {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
    </div>
  );
}
