"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { togglePersonalTask, deletePersonalTask, updatePersonalTask } from "@/lib/actions/personalTasks";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EventFieldsFieldset } from "./EventFieldsFieldset";
import type { CalendarRecurrence } from "./types";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

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
  studentId,
  studentName,
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
  /** Set when the task is about a student, so it can link to them. */
  studentId?: string | null;
  studentName?: string | null;
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
  const del = useButtonAction();
  // The done box saves as it is ticked; this says so beside it.
  const toggle = useButtonAction();
  const action = updatePersonalTask.bind(null, taskId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  // The row goes when the delete works, so success is a toast; a failure is
  // said beside the bin, which is still there.
  function handleDelete() {
    void del.run(() => deletePersonalTask(taskId, revalidateTo), { toast: "Reminder deleted." });
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
          <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
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
      {/* Stacked on a phone — see CalendarTaskRow for why. */}
      <div className="flex flex-col gap-1 text-sm lg:flex-row lg:items-center lg:justify-between lg:gap-2">
        <div className="flex flex-wrap items-center gap-x-2">
        <label className="flex items-start gap-2 lg:items-center">
          <input
            type="checkbox"
            checked={checked}
            disabled={toggle.pending}
            onChange={async (e) => {
              const next = e.target.checked;
              const previous = checked;
              setChecked(next);
              setToggleError(null);
              // The calendar lists pending tasks only, so one ticked done leaves the
              // list as soon as the page refreshes — and the note beside it goes
              // too. Said as a toast, as a delete is; un-ticking stays in place.
              const result = await toggle.run(() => togglePersonalTask(taskId, revalidateTo, next), next ? { toast: "Marked done." } : {});
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
          <ActionStatus state={toggle.state} pending={toggle.pending} label={checked ? "Marked done." : "Marked not done."} />
        </div>
        {studentId && (
          <Link
            href={`/students/${studentId}`}
            className="shrink-0 pl-6 text-xs text-primary hover:underline lg:pl-0"
          >
            {studentName ?? "Open student"} →
          </Link>
        )}
        <div className="flex shrink-0 items-center gap-2 pl-6 lg:pl-0">
          <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{priority}</Badge>
          <Badge tone="primary">Personal</Badge>
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} disabled={del.pending} className="w-fit text-xs text-muted hover:text-danger disabled:opacity-50">
            🗑️
          </button>
          <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
        </div>
      </div>
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
    </div>
  );
}
