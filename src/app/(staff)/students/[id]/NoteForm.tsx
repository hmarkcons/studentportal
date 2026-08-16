"use client";

import { useActionState } from "react";
import { addNote } from "@/lib/actions/notes";

export function NoteForm({ studentId }: { studentId: string }) {
  const boundAction = addNote.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          name="channel"
          defaultValue="call"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="system">System</option>
        </select>
        <input
          name="body"
          required
          placeholder="What happened?"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
