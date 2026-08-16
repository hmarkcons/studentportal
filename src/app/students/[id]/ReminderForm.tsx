"use client";

import { useActionState, useTransition } from "react";
import { addReminder, resolveReminder } from "@/lib/actions/reminders";

export function ReminderForm({ studentId }: { studentId: string }) {
  const boundAction = addReminder.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        type="date"
        name="due_date"
        required
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {pending ? "Adding…" : "Add deadline"}
      </button>
      {state?.error && <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>}
    </form>
  );
}

export function ResolveReminderButton({ studentId, reminderId }: { studentId: string; reminderId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => resolveReminder(studentId, reminderId))}
      className="text-xs text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      Mark resolved
    </button>
  );
}
