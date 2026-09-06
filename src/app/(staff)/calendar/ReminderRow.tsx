"use client";

import { useActionState, useState } from "react";
import { toggleReminderResolved, updateReminder, deleteReminder } from "@/lib/actions/calendarEvents";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ReminderRow({
  reminderId,
  label,
  note,
  date,
  time,
  resolved,
  revalidateTo,
}: {
  reminderId: string;
  label: string;
  note: string | null;
  date: string;
  time: string | null;
  resolved: boolean;
  revalidateTo: string;
}) {
  const [checked, setChecked] = useState(resolved);
  const [editing, setEditing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateReminder.bind(null, reminderId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm("Delete this reminder? This can't be undone.")) return;
    setDeleteError(null);
    const result = await deleteReminder(reminderId, revalidateTo);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-2">
        <div className="flex flex-wrap items-end gap-2">
          <Input name="due_date" type="date" defaultValue={date} required className="w-36" />
          <Input name="due_time" type="time" defaultValue={time ?? ""} className="w-28" />
        </div>
        <Input name="note" defaultValue={note ?? ""} placeholder="Remark" />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            Save
          </Button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
            Cancel
          </button>
        </div>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <label className="flex min-w-0 items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={async (e) => {
              const next = e.target.checked;
              const previous = checked;
              setChecked(next);
              setToggleError(null);
              const result = await toggleReminderResolved(reminderId, revalidateTo, next);
              if (result?.error) {
                setToggleError(result.error);
                setChecked(previous);
              }
            }}
          />
          <span className={checked ? "truncate text-muted line-through" : "truncate text-ink"}>
            {time && <span className="mr-1 font-mono text-xs text-muted">{time}</span>}
            {label}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} className="text-xs text-muted hover:text-danger">
            🗑️
          </button>
        </div>
      </div>
      {note && <p className={`ml-6 text-xs ${checked ? "text-muted line-through" : "text-muted"}`}>{note}</p>}
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
      {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
    </div>
  );
}
