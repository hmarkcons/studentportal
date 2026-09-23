"use client";

import { useActionState, useState } from "react";
import { toggleReminderResolved, updateReminder, deleteReminder } from "@/lib/actions/calendarEvents";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";

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
  const del = useButtonAction();
  // The done box saves as it is ticked; this says so beside it.
  const toggle = useButtonAction();
  const action = updateReminder.bind(null, reminderId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  // The row goes when the delete works, so success is a toast; a failure is
  // said beside the bin, which is still there.
  function handleDelete() {
    if (!confirm("Delete this reminder? This can't be undone.")) return;
    void del.run(() => deleteReminder(reminderId, revalidateTo), { toast: "Reminder deleted." });
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
          <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
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
      {/* Stacked on a phone so a long "<student> - Follow-up (<number>)"
          label wraps in full instead of being truncated by the actions. */}
      <div className="flex flex-col gap-1 text-sm lg:flex-row lg:items-center lg:justify-between lg:gap-2">
        <div className="flex flex-wrap items-center gap-x-2">
        <label className="flex min-w-0 items-start gap-2 lg:items-center">
          <input
            type="checkbox"
            className="mt-0.5 lg:mt-0"
            checked={checked}
            disabled={toggle.pending}
            onChange={async (e) => {
              const next = e.target.checked;
              const previous = checked;
              setChecked(next);
              setToggleError(null);
              const result = await toggle.run(() => toggleReminderResolved(reminderId, revalidateTo, next));
              if (result?.error) {
                setToggleError(result.error);
                setChecked(previous);
              }
            }}
          />
          <span className={checked ? "min-w-0 text-muted line-through" : "min-w-0 text-ink"}>
            {time && <span className="mr-1 font-mono text-xs text-muted">{time}</span>}
            {label}
          </span>
        </label>
          <ActionStatus state={toggle.state} pending={toggle.pending} label={checked ? "Resolved." : "Reopened."} />
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-6 lg:pl-0">
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
            ✏️
          </button>
          <button onClick={handleDelete} disabled={del.pending} className="w-fit text-xs text-muted hover:text-danger disabled:opacity-50">
            🗑️
          </button>
          <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
        </div>
      </div>
      {note && <p className={`ml-6 text-xs ${checked ? "text-muted line-through" : "text-muted"}`}>{note}</p>}
      {toggleError && <p className="text-xs text-danger">{toggleError}</p>}
    </div>
  );
}
